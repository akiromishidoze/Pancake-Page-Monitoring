import { fetchBotCakePages } from './botcake';
import { fetchPancakeShops, fetchPancakePages, fetchPancakeActivePageIds, fetchPancakeActivePageIdsFromCustomers, fetchCachedPancakeShops, mergePagesActivation, TARGET_SHOP_IDS, type PancakeShop } from './pancake';
import { getEndpoint, insertSnapshot, getSetting, setSetting, listEndpoints, type SlimPage } from './db';
import { broadcastSSE } from './sse';

const POLL_INTERVAL_MS = 60_000;

let _lastPolledAt: string | null = null;

let _botcakeLastRefresh = 0;
let _pancakeLastRefresh = 0;

export function startPoller() {
  const alreadyStarted = getSetting('poller_started');
  if (alreadyStarted === '1') return;
  setSetting('poller_started', '1');
  console.log('[poller] starting; interval =', POLL_INTERVAL_MS, 'ms');

  void refreshAll();
  setInterval(() => void refreshAll(), POLL_INTERVAL_MS);
}

export async function refreshAll() {
  _lastPolledAt = new Date().toISOString();
  await Promise.all([refreshBotCake(), refreshPancake()]);
  setSetting('last_scheduled_run', Date.now().toString());
}

async function refreshBotCake() {
  const now = Date.now();
  if (now - _botcakeLastRefresh < POLL_INTERVAL_MS) return;
  _botcakeLastRefresh = now;

  const endpoint = getEndpoint('botcake-platform');
  if (!endpoint?.access_token) {
    return;
  }

  try {
    const pages = await fetchBotCakePages(endpoint.access_token);
    const runId = `botcake_refresh_${now}`;
    const ts = new Date().toISOString();

    const activePages = pages.map((p) => ({
      page_id: p.page_id,
      id: p.page_id,
      name: p.name,
      shop_label: null as string | null,
      shop: null as string | null,
      activity_kind: null as string | null,
      kind: null as string | null,
      is_activated: true,
      is_canary: false,
      activation_reason: null as string | null,
      reason: null as string | null,
      state_change: null as string | null,
      activity_kind_change: null as string | null,
      last_order_at: null as string | null,
      last_customer_activity_at: null as string | null,
      response_ms: null as number | null,
      fetch_errors: 0,
    }));

    const result = insertSnapshot({
      run_id: runId,
      endpoint_id: 'botcake-platform',
      generated_at: ts,
      heartbeat_ok: true,
      run_quality: 'full',
      severity: null,
      canary_status: 'ok',
      canary_alert: false,
      outage_suspected: false,
      alert_count: 0,
      rule_version: null,
      in_maintenance_window: false,
      total_pages: pages.length,
      active_pages_count: pages.length,
      inactive_pages_count: 0,
      receiver_sd_size_bytes: null,
      raw_summary: { source: 'botcake-refresh', page_count: pages.length },
      active_pages: activePages,
      inactive_pages: [],
    });

    if (result.inserted) {
      console.log('[poller] botcake: inserted', pages.length, 'pages, run', runId);
      broadcastSSE('refresh', JSON.stringify({ source: 'botcake-poller', run_id: runId }));
    }
  } catch (err) {
    console.error('[poller] botcake: refresh failed:', err);
  }
}

async function refreshPancake() {
  try {
  const now = Date.now();
  if (now - _pancakeLastRefresh < POLL_INTERVAL_MS) return;
  _pancakeLastRefresh = now;

  const endpoints = listEndpoints().filter(ep => ep.id !== 'botcake-platform' && ep.url && ep.access_token && ep.is_active);
  if (endpoints.length === 0) return;

  const token = endpoints[0].access_token!;
  let shops: PancakeShop[];
  let pagesApi: PancakePage[] = [];
  try {
    [shops, pagesApi] = await Promise.all([
      fetchPancakeShops(token),
      fetchPancakePages(token).catch(() => [] as PancakePage[]),
    ]);
  } catch (err) {
    console.warn('[poller] pancake: live shops fetch failed, trying cache:', err);
    shops = fetchCachedPancakeShops();
    if (shops.length === 0) {
      console.error('[poller] pancake: no cached shops data available either, skipping');
      return;
    }
    console.log('[poller] pancake: using cached shops data (' + shops.length + ' shops)');
  }

  shops = mergePagesActivation(shops, pagesApi);

  const shopById = new Map(shops.filter(s => TARGET_SHOP_IDS.includes(s.id)).map(s => [s.id, s]));

  const activePageIdsByShop = new Map<number, Set<string>>();
  await Promise.all(TARGET_SHOP_IDS.map(async (sid) => {
    const combined = new Set<string>();
    try {
      const orderIds = await fetchPancakeActivePageIds(token, sid);
      for (const id of orderIds) combined.add(id);
    } catch (err) {
      console.error(`[poller] pancake: orders failed for shop ${sid}:`, err);
    }
    try {
      const customerIds = await fetchPancakeActivePageIdsFromCustomers(token, sid);
      for (const id of customerIds) combined.add(id);
    } catch (err) {
      console.error(`[poller] pancake: customers failed for shop ${sid}:`, err);
    }
    activePageIdsByShop.set(sid, combined);
  }));

  for (const ep of endpoints) {
    const shopId = parseInt(ep.id, 10);
    const shop = shopById.get(shopId);
    if (!shop) continue;

    const orderPageIds = activePageIdsByShop.get(shopId) ?? new Set<string>();

    const ts = new Date().toISOString();
    const runId = `pancake_refresh_${now}_${ep.id}`;

    const activePages: SlimPage[] = [];
    const inactivePages: SlimPage[] = [];
    for (const p of shop.pages) {
      const hasOrders = orderPageIds.has(p.id);
      const apiActive = p.is_activated === true;
      const base = {
        shop_label: ep.shop_label ?? null, shop: ep.shop_label ?? null,
        name: p.name,
        page_id: p.id, id: p.id,
        activity_kind: null, kind: null,
        activation_reason: null, reason: null,
        last_order_at: null, last_customer_activity_at: null,
        state_change: null, activity_kind_change: null,
        is_canary: false,
        response_ms: null,
        fetch_errors: 0,
      };
      (hasOrders || apiActive ? activePages : inactivePages).push(base);
    }

    const result = insertSnapshot({
      run_id: runId, endpoint_id: ep.id, generated_at: ts,
      heartbeat_ok: true, run_quality: 'full', severity: null,
      canary_status: 'ok', canary_alert: false, outage_suspected: false, alert_count: 0,
      rule_version: null, in_maintenance_window: false,
      total_pages: shop.pages.length,
      active_pages_count: activePages.length, inactive_pages_count: inactivePages.length,
      receiver_sd_size_bytes: null,
      raw_summary: { source: 'pancake-shops-poller', endpoint: ep.name, page_count: shop.pages.length },
      active_pages: activePages, inactive_pages: inactivePages,
    });

    if (result.inserted) {
      console.log(`[poller] pancake ${ep.name}: ${activePages.length} active / ${inactivePages.length} inactive (${shop.pages.length} total), run ${runId}`);
      broadcastSSE('refresh', JSON.stringify({ source: 'pancake-poller', run_id: runId, endpoint_id: ep.id }));
    }
  }
  } catch (err) {
    console.error('[poller] pancake: refresh failed:', err);
  }
}

export function getPollerStatus() {
  return {
    started: getSetting('poller_started') === '1',
    last_polled_at: _lastPolledAt,
    interval_ms: POLL_INTERVAL_MS,
  };
}

let _isPolling = false;
export async function pollIfNeeded() {
  if (_isPolling) return;
  if (_lastPolledAt && Date.now() - new Date(_lastPolledAt).getTime() < POLL_INTERVAL_MS) {
    return;
  }

  _isPolling = true;
  try {
    await refreshAll();
  } finally {
    _isPolling = false;
  }
}
