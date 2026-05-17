import { fetchBotCakePages, checkBotCakeConversations, checkBotCakeToolsFlows } from './botcake';
import { fetchPancakeShops, fetchPancakePages, fetchPancakeActivePageIds, fetchPancakeActivePageIdsFromCustomers, fetchCachedPancakeShops, mergePagesActivation, TARGET_SHOP_IDS, type PancakeShop, type PancakePage } from './pancake';
import { getEndpoint, insertSnapshot, getSetting, setSetting, listEndpoints, getPancakeActivePageIds, getPreviousRunActiveCount, getDb, getBotCakeOverrides, type SlimPage } from './db';
import { broadcastSSE } from './sse';

const POLL_INTERVAL_MS = 60_000;

let _lastPolledAt: string | null = null;

let _botcakeLastRefresh = 0;
let _pancakeLastRefresh = 0;

export function startPoller() {
  console.log('[poller] starting; interval =', POLL_INTERVAL_MS, 'ms');

  void refreshAll();
  setInterval(() => void refreshAll(), POLL_INTERVAL_MS);
}

export async function refreshAll() {
  _lastPolledAt = new Date().toISOString();
  await Promise.all([refreshBotCake(), refreshPancake()]);
  setSetting('last_scheduled_run', Date.now().toString());
}

const ALERT_DROP_THRESHOLD_PCT = 0.50;

export async function refreshBotCake() {
  const now = Date.now();
  if (now - _botcakeLastRefresh < POLL_INTERVAL_MS) return;
  _botcakeLastRefresh = now;

  const endpoint = getEndpoint('botcake-platform');
  if (!endpoint?.access_token) return;

  try {
    const pages = await fetchBotCakePages(endpoint.access_token);
    if (pages.length === 0) {
      console.warn('[poller] botcake: API returned 0 pages — skipping insert to preserve previous data');
      return;
    }
    const runId = `botcake_refresh_${now}`;
    const ts = new Date().toISOString();

    const pancakeActive = getPancakeActivePageIds();

    const noOrders = pages.filter(p => !pancakeActive.has(p.page_id)).map(p => p.page_id);
    const convResult = await checkBotCakeConversations(noOrders, endpoint.access_token);

    const noOrdersNoConv = pages.filter(p => !pancakeActive.has(p.page_id) && !convResult.has(p.page_id)).map(p => p.page_id);
    const toolsActive = await checkBotCakeToolsFlows(noOrdersNoConv, endpoint.access_token);

    const activePages: SlimPage[] = [];
    const inactivePages: SlimPage[] = [];

    for (const p of pages) {
      if (pancakeActive.has(p.page_id)) {
        activePages.push({
          page_id: p.page_id, id: p.page_id,
          name: p.name,
          shop_label: null, shop: null,
          activity_kind: null, kind: null,
          activation_reason: 'pancake-activity', reason: null,
          state_change: null, activity_kind_change: null,
          is_canary: false,
          response_ms: null, fetch_errors: 0,
          last_customer_activity_at: null,
          last_order_at: null,
        });
      } else if (convResult.has(p.page_id)) {
        const convInfo = convResult.get(p.page_id)!;
        activePages.push({
          page_id: p.page_id, id: p.page_id,
          name: p.name,
          shop_label: null, shop: null,
          activity_kind: null, kind: null,
          activation_reason: 'has-conversations', reason: null,
          state_change: null, activity_kind_change: null,
          is_canary: false,
          response_ms: null, fetch_errors: 0,
          last_customer_activity_at: convInfo.ts,
          last_order_at: null,
          customer_count: convInfo.count,
        });
      } else if (toolsActive.has(p.page_id)) {
        activePages.push({
          page_id: p.page_id, id: p.page_id,
          name: p.name,
          shop_label: null, shop: null,
          activity_kind: null, kind: null,
          activation_reason: 'has-tools', reason: null,
          state_change: null, activity_kind_change: null,
          is_canary: false,
          response_ms: null, fetch_errors: 0,
          last_customer_activity_at: toolsActive.get(p.page_id) ?? null,
          last_order_at: null,
        });
      } else {
        inactivePages.push({
          page_id: p.page_id, id: p.page_id,
          name: p.name,
          shop_label: null, shop: null,
          activity_kind: null, kind: null,
          activation_reason: 'no-activity', reason: null,
          state_change: null, activity_kind_change: null,
          is_canary: false,
          response_ms: null, fetch_errors: 0,
          last_customer_activity_at: null,
          last_order_at: null,
        });
      }
    }

    // Apply manual overrides (overrides signal-based decisions)
    const overrides = getBotCakeOverrides();
    if (overrides.size > 0) {
      const toActive: SlimPage[] = [];
      const toInactive: SlimPage[] = [];
      for (const p of activePages) {
        const ov = overrides.get(p.page_id ?? p.id ?? '');
        if (ov && !ov.is_active) toInactive.push(p);
      }
      for (const p of inactivePages) {
        const ov = overrides.get(p.page_id ?? p.id ?? '');
        if (ov && ov.is_active) toActive.push(p);
      }
      for (const p of toInactive) {
        p.activation_reason = 'manual-override';
        activePages.splice(activePages.indexOf(p), 1);
        inactivePages.push(p);
      }
      for (const p of toActive) {
        p.activation_reason = 'manual-override';
        inactivePages.splice(inactivePages.indexOf(p), 1);
        activePages.push(p);
      }
    }

    const prevActive = getPreviousRunActiveCount('botcake-platform');
    let alertCount = 0;
    let outageSuspected = false;
    if (prevActive !== null && prevActive > 0) {
      const dropRatio = (prevActive - activePages.length) / prevActive;
      if (dropRatio >= ALERT_DROP_THRESHOLD_PCT) {
        alertCount = activePages.length === 0 ? 2 : 1;
        outageSuspected = true;
        console.warn(`[poller] ALERT BotCake: active pages dropped ${Math.round(dropRatio * 100)}% (${prevActive} → ${activePages.length})`);
        broadcastSSE('alert', JSON.stringify({
          endpoint_id: 'botcake-platform', shop: 'BotCake',
          previous: prevActive, current: activePages.length,
          drop_pct: Math.round(dropRatio * 100),
        }));
      }
    }

    const result = insertSnapshot({
      run_id: runId,
      endpoint_id: 'botcake-platform',
      generated_at: ts,
      heartbeat_ok: true,
      run_quality: 'full',
      severity: null,
      canary_status: 'ok',
      canary_alert: false,
      outage_suspected: outageSuspected,
      alert_count: alertCount,
      rule_version: null,
      in_maintenance_window: false,
      total_pages: pages.length,
      active_pages_count: activePages.length,
      inactive_pages_count: inactivePages.length,
      receiver_sd_size_bytes: null,
      raw_summary: {
        source: 'botcake-refresh',
        page_count: pages.length,
        pancake_activity: activePages.filter(p => p.activation_reason === 'pancake-activity').length,
        has_conversations: activePages.filter(p => p.activation_reason === 'has-conversations').length,
        has_tools: activePages.filter(p => p.activation_reason === 'has-tools').length,
        no_activity: inactivePages.length,
      },
      active_pages: activePages,
      inactive_pages: inactivePages,
    });

    if (result.inserted) {
      setSetting('poller_ok_botcake-platform', Date.now().toString());
      const pa = activePages.filter(p => p.activation_reason === 'pancake-activity').length;
      const hc = activePages.filter(p => p.activation_reason === 'has-conversations').length;
      const ht = activePages.filter(p => p.activation_reason === 'has-tools').length;
      const na = inactivePages.length;
      console.log(`[poller] botcake: ${activePages.length}A (${pa}orders+${hc}conv+${ht}tools) / ${na}I — ${pages.length} total, run ${runId}`);
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
  let anyShopHadData = false;
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
    if (combined.size > 0) anyShopHadData = true;
    activePageIdsByShop.set(sid, combined);
  }));

  if (!anyShopHadData) {
    console.warn('[poller] pancake: all shops returned 0 active pages — likely network/DNS issue, falling back to previous good run data');
    const db = getDb();
    for (const sid of TARGET_SHOP_IDS) {
      const prevRun = db.prepare(`
        SELECT run_id FROM runs
        WHERE endpoint_id = ? AND (active_pages > 0 OR active_pages IS NULL)
        ORDER BY generated_at DESC LIMIT 1
      `).get(String(sid)) as { run_id: string } | undefined;
      if (!prevRun) continue;
      const prevActive = db.prepare('SELECT page_id FROM page_states WHERE run_id = ? AND is_activated = 1').all(prevRun.run_id) as { page_id: string }[];
      const ids = new Set(prevActive.map(p => p.page_id));
      if (ids.size > 0) {
        activePageIdsByShop.set(sid, ids);
        console.log(`[poller] pancake: restored ${ids.size} active pages from previous run for shop ${sid}`);
      }
    }
  }

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

    const prevActive = getPreviousRunActiveCount(ep.id);
    let alertCount = 0;
    let outageSuspected = false;
    if (prevActive !== null && prevActive > 0) {
      const dropRatio = (prevActive - activePages.length) / prevActive;
      if (dropRatio >= ALERT_DROP_THRESHOLD_PCT) {
        alertCount = activePages.length === 0 ? 2 : 1;
        outageSuspected = true;
        console.warn(`[poller] ALERT ${ep.name}: active pages dropped ${Math.round(dropRatio * 100)}% (${prevActive} → ${activePages.length})`);
        broadcastSSE('alert', JSON.stringify({
          endpoint_id: ep.id, shop: ep.name,
          previous: prevActive, current: activePages.length,
          drop_pct: Math.round(dropRatio * 100),
        }));
      }
    }

    const result = insertSnapshot({
      run_id: runId, endpoint_id: ep.id, generated_at: ts,
      heartbeat_ok: true, run_quality: 'full', severity: null,
      canary_status: 'ok', canary_alert: false,
      outage_suspected: outageSuspected, alert_count: alertCount,
      rule_version: null, in_maintenance_window: false,
      total_pages: shop.pages.length,
      active_pages_count: activePages.length, inactive_pages_count: inactivePages.length,
      receiver_sd_size_bytes: null,
      raw_summary: { source: 'pancake-shops-poller', endpoint: ep.name, page_count: shop.pages.length },
      active_pages: activePages, inactive_pages: inactivePages,
    });

    if (result.inserted) {
      setSetting(`poller_ok_${ep.id}`, Date.now().toString());
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
