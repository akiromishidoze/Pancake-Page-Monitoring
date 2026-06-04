import { fetchBotCakePages, checkBotCakeConversations, checkBotCakeToolsFlows } from './botcake';
import { fetchPancakeShops, fetchPancakePages, fetchPancakeActivePageIds, fetchPancakeActivePageIdsFromCustomers, fetchCachedPancakeShops, mergePagesActivation, TARGET_SHOP_IDS, type PancakeShop, type PancakePage } from './pancake';
import { insertSnapshot, setSetting, listEndpoints, getPancakeActivePageIds, getPreviousRunActiveCount, pool, getBotCakeOverrides, isBotCakeEndpoint, type SlimPage, type EndpointRow } from './db';
import { broadcastSSE } from './sse';
import { createLogger } from './logger';
import { addNotification } from './notifications';

const log = createLogger('poller');

const POLL_INTERVAL_MS = 60_000;

let _pollerInterval: ReturnType<typeof setInterval> | null = null;
let _lastPolledAt: string | null = null;

let _refreshingBotCake = false;
let _refreshingPancake = false;

export function startPoller() {
  if (_pollerInterval) return;
  log.info('starting; interval = %d ms', POLL_INTERVAL_MS);

  const doRefresh = () => void refreshAll();
  setTimeout(doRefresh, 30_000);
  _pollerInterval = setInterval(doRefresh, POLL_INTERVAL_MS);
}

export function stopPoller() {
  if (_pollerInterval) {
    clearInterval(_pollerInterval);
    _pollerInterval = null;
    log.info('stopped');
  }
}

export async function refreshAll() {
  _lastPolledAt = new Date().toISOString();
  await Promise.all([refreshBotCake(), refreshPancake()]);
  broadcastSSE('refresh', JSON.stringify({ source: 'refresh-all', all_endpoints: true }));
  await setSetting('last_scheduled_run', Date.now().toString()).catch(e => log.error({ err: e }, 'Failed to update last_scheduled_run'));
}

const ALERT_DROP_THRESHOLD_PCT = 0.50;

export async function refreshBotCake() {
  if (_refreshingBotCake) return;
  _refreshingBotCake = true;
  let botCakeEndpoints: EndpointRow[] = [];
  try {
    botCakeEndpoints = (await listEndpoints()).filter(isBotCakeEndpoint);
    await Promise.all(botCakeEndpoints.map(ep => refreshSingleBotCake(ep)));
  } catch (err) {
    log.error({ err }, 'botcake: refresh failed');
    const epNames = botCakeEndpoints.length > 0 ? botCakeEndpoints.map(e => e.name).join(', ') : 'unknown';
    void addNotification('external_error', 'warning', 'BotCake Refresh Failed', `BotCake refresh error for [${epNames}]: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    _refreshingBotCake = false;
  }
}

async function refreshSingleBotCake(endpoint: EndpointRow) {
  const fbPageId = endpoint.fb_page_id!;
  if (!endpoint.access_token) return;

  const pages = await fetchBotCakePages(endpoint.access_token, fbPageId);
  if (pages.length === 0) {
    log.warn({ ep: endpoint.name }, 'botcake: API returned 0 pages — skipping insert');
    void addNotification('external_error', 'warning', 'BotCake API Returned 0 Pages', `Endpoint "${endpoint.name}" returned 0 pages during refresh. Skipping insert.`);
    return;
  }
  const runId = `botcake_refresh_${Date.now()}_${endpoint.id}`;
  const ts = new Date().toISOString();

  const pancakeActive = await getPancakeActivePageIds();

  const noOrders = pages.filter(p => !pancakeActive.has(p.page_id)).map(p => p.page_id);
  const convResult = await checkBotCakeConversations(noOrders, endpoint.access_token, fbPageId);

  const noOrdersNoConv = pages.filter(p => !pancakeActive.has(p.page_id) && !convResult.has(p.page_id)).map(p => p.page_id);
  const toolsActive = await checkBotCakeToolsFlows(noOrdersNoConv, endpoint.access_token, fbPageId);

  let activePages: SlimPage[] = [];
  let inactivePages: SlimPage[] = [];

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
  const overrides = await getBotCakeOverrides();
  if (overrides.size > 0) {
    const remainingActive: SlimPage[] = [];
    const remainingInactive: SlimPage[] = [];
    for (const p of activePages) {
      const ov = overrides.get(p.page_id ?? p.id ?? '');
      if (ov && !ov.is_active) {
        p.activation_reason = 'manual-override';
        remainingInactive.push(p);
      } else {
        remainingActive.push(p);
      }
    }
    for (const p of inactivePages) {
      const ov = overrides.get(p.page_id ?? p.id ?? '');
      if (ov && ov.is_active) {
        p.activation_reason = 'manual-override';
        remainingActive.push(p);
      } else {
        remainingInactive.push(p);
      }
    }
    activePages = remainingActive;
    inactivePages = remainingInactive;
  }

  const prevActive = await getPreviousRunActiveCount(endpoint.id);
  let alertCount = 0;
  let outageSuspected = false;
  if (prevActive !== null && prevActive > 0) {
    const dropRatio = (prevActive - activePages.length) / prevActive;
    if (dropRatio >= ALERT_DROP_THRESHOLD_PCT) {
      alertCount = activePages.length === 0 ? 2 : 1;
      outageSuspected = true;
      log.warn({ dropPct: Math.round(dropRatio * 100), prevActive, current: activePages.length }, 'ALERT %s: active pages dropped %d%% (%d → %d)', endpoint.name, Math.round(dropRatio * 100), prevActive, activePages.length);
      broadcastSSE('alert', JSON.stringify({
        endpoint_id: endpoint.id, shop: endpoint.name,
        previous: prevActive, current: activePages.length,
        drop_pct: Math.round(dropRatio * 100),
      }));
      void addNotification('down_page', 'critical', `Active Pages Dropped: ${endpoint.name}`, `${activePages.length === 0 ? 'All' : 'Significant'} pages dropped on ${endpoint.name}: ${prevActive} → ${activePages.length} active (${Math.round(dropRatio * 100)}% drop)`);
    }
  }

  const result = await insertSnapshot({
    run_id: runId,
    endpoint_id: endpoint.id,
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
    await setSetting(`poller_ok_${endpoint.id}`, Date.now().toString());
    const pa = activePages.filter(p => p.activation_reason === 'pancake-activity').length;
    const hc = activePages.filter(p => p.activation_reason === 'has-conversations').length;
    const ht = activePages.filter(p => p.activation_reason === 'has-tools').length;
    const na = inactivePages.length;
    log.info('botcake %s: %dA (%dorders+%dconv+%dtools) / %dI — %d total, run %s', endpoint.name, activePages.length, pa, hc, ht, na, pages.length, runId);
  }
}

async function refreshPancake() {
  if (_refreshingPancake) return;
  _refreshingPancake = true;
  let endpoints: EndpointRow[] = [];
  try {
  const allEndpoints = await listEndpoints();
  endpoints = allEndpoints.filter(ep => !isBotCakeEndpoint(ep) && ep.url && ep.access_token && ep.is_active);
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
    log.warn({ err }, 'pancake: live shops fetch failed, trying cache');
    shops = await fetchCachedPancakeShops();
    if (shops.length === 0) {
      log.error('pancake: no cached shops data available either, skipping');
      return;
    }
    log.info('pancake: using cached shops data (%d shops)', shops.length);
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
      log.error({ err, shopId: sid }, 'pancake: orders failed for shop %d', sid);
      void addNotification('external_error', 'info', `Orders Fetch Failed for Shop ${sid}`, err instanceof Error ? err.message : String(err));
    }
    try {
      const customerIds = await fetchPancakeActivePageIdsFromCustomers(token, sid);
      for (const id of customerIds) combined.add(id);
    } catch (err) {
      log.error({ err, shopId: sid }, 'pancake: customers failed for shop %d', sid);
      void addNotification('external_error', 'info', `Customers Fetch Failed for Shop ${sid}`, err instanceof Error ? err.message : String(err));
    }
    if (combined.size > 0) anyShopHadData = true;
    activePageIdsByShop.set(sid, combined);
  }));

  if (!anyShopHadData) {
    log.warn('pancake: all shops returned 0 active pages — likely network/DNS issue, falling back to previous good run data');
    void addNotification('external_error', 'warning', 'Pancake API Returned 0 Active Pages', 'All shops returned 0 active pages — falling back to previous run data');
      for (const sid of TARGET_SHOP_IDS) {
        const prevRun = (await pool.query(`
          SELECT run_id FROM runs
          WHERE endpoint_id = $1 AND (active_pages > 0 OR active_pages IS NULL)
          ORDER BY generated_at DESC LIMIT 1
        `, [String(sid)])).rows[0] as { run_id: string } | undefined;
        if (!prevRun) continue;
        const prevActive = (await pool.query('SELECT page_id FROM page_states WHERE run_id = $1 AND is_activated IS TRUE', [prevRun.run_id])).rows as { page_id: string }[];
      const ids = new Set(prevActive.map(p => p.page_id));
      if (ids.size > 0) {
        activePageIdsByShop.set(sid, ids);
        log.info('pancake: restored %d active pages from previous run for shop %d', ids.size, sid);
      }
    }
  }

  for (const ep of endpoints) {
    const shopId = parseInt(ep.id, 10);
    const shop = shopById.get(shopId);
    if (!shop) continue;

    const orderPageIds = activePageIdsByShop.get(shopId) ?? new Set<string>();

    const ts = new Date().toISOString();
    const runId = `pancake_refresh_${Date.now()}_${ep.id}`;

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

    const prevActive = await getPreviousRunActiveCount(ep.id);
    let alertCount = 0;
    let outageSuspected = false;
    if (prevActive !== null && prevActive > 0) {
      const dropRatio = (prevActive - activePages.length) / prevActive;
      if (dropRatio >= ALERT_DROP_THRESHOLD_PCT) {
        alertCount = activePages.length === 0 ? 2 : 1;
        outageSuspected = true;
        log.warn({ dropPct: Math.round(dropRatio * 100), prevActive, current: activePages.length, epName: ep.name }, 'ALERT %s: active pages dropped %d%% (%d → %d)', ep.name, Math.round(dropRatio * 100), prevActive, activePages.length);
        broadcastSSE('alert', JSON.stringify({
          endpoint_id: ep.id, shop: ep.name,
          previous: prevActive, current: activePages.length,
          drop_pct: Math.round(dropRatio * 100),
        }));
        void addNotification('down_page', 'critical', `Active Pages Dropped: ${ep.name}`, `${activePages.length === 0 ? 'All' : 'Significant'} pages dropped on ${ep.name}: ${prevActive} → ${activePages.length} active (${Math.round(dropRatio * 100)}% drop)`);
      }
    }

    const result = await insertSnapshot({
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
      await setSetting(`poller_ok_${ep.id}`, Date.now().toString());
      log.info('pancake %s: %d active / %d inactive (%d total), run %s', ep.name, activePages.length, inactivePages.length, shop.pages.length, runId);
    }
  }
  } catch (err) {
    log.error({ err }, 'pancake: refresh failed');
    const epNames = endpoints.length > 0 ? endpoints.map(e => e.name).join(', ') : 'unknown';
    void addNotification('external_error', 'warning', 'Pancake Refresh Failed', `Pancake refresh error for [${epNames}]: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    _refreshingPancake = false;
  }
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
