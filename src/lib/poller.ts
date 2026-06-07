import { fetchBotCakePages, checkBotCakeConversations, checkBotCakeToolsFlows, recordBotCakeApiHealth, invalidateBotCakeCaches, type BotCakePage } from './botcake';
import { fetchPancakeShops, fetchPancakePages, fetchPancakeActivePageIds, fetchPancakeActivePageIdsFromCustomers, fetchCachedPancakeShops, mergePagesActivation, TARGET_SHOP_IDS, type PancakeShop, type PancakePage } from './pancake';
import { insertSnapshot, setSetting, listEndpoints, getPancakeActivePageIds, getPreviousRunActiveCount, pool, getBotCakeOverrides, isBotCakeEndpoint, type SlimPage, type EndpointRow } from './db';
import { broadcastSSE } from './sse';
import { createLogger } from './logger';
import { addNotification } from './notifications';
import { shouldAttempt, recordSuccess as cbRecordSuccess, recordFailure, getBreakerState } from './circuit-breaker';

const log = createLogger('poller');

const POLL_INTERVAL_MS = 60_000;
const STALE_INTERVAL_MIN = 30_000;
const STALE_INTERVAL_MAX = 480_000;
const STALE_BACKOFF_CAP = 3;

let _pollerTimer: ReturnType<typeof setTimeout> | null = null;
let _lastPolledAt: string | null = null;
let _pollerStopped = false;

let _refreshingBotCake = false;
let _refreshingPancake = false;

let _stableCycles = 0;
let _lastTotalActivePages = -1;

function computeAdaptiveInterval(): number {
  const multiplier = Math.min(Math.pow(2, _stableCycles), Math.pow(2, STALE_BACKOFF_CAP));
  const interval = Math.round(POLL_INTERVAL_MS * multiplier);
  return Math.min(Math.max(interval, STALE_INTERVAL_MIN), STALE_INTERVAL_MAX);
}

async function checkActivityChange(): Promise<boolean> {
  try {
    const result = await pool.query(`
      SELECT COALESCE(SUM(r.active_pages_count), 0) AS total
      FROM runs r
      WHERE r.generated_at = (
        SELECT MAX(r2.generated_at) FROM runs r2 WHERE r2.endpoint_id = r.endpoint_id
      )
    `);
    const total = Number(result.rows[0]?.total ?? 0);
    if (_lastTotalActivePages >= 0 && total !== _lastTotalActivePages) {
      _lastTotalActivePages = total;
      return true;
    }
    _lastTotalActivePages = total;
  } catch {
    // If query fails, assume no change
  }
  return false;
}

export function startPoller() {
  if (_pollerTimer) return;
  _pollerStopped = false;
  log.info('starting; base interval = %d ms', POLL_INTERVAL_MS);

  // Initial delay then recursive setTimeout (prevents pileups)
  _pollerTimer = setTimeout(() => scheduleNextRefresh(true), 30_000);
}

async function scheduleNextRefresh(isFirst: boolean) {
  if (_pollerStopped) return;
  if (isFirst) log.info('poller: first refresh');
  try {
    await refreshAll();
  } catch (err) {
    log.error({ err }, 'poller: refreshAll failed');
  }
  if (_pollerStopped) return;

  const changed = await checkActivityChange();
  if (changed) {
    _stableCycles = 0;
  } else {
    _stableCycles++;
  }

  const nextInterval = computeAdaptiveInterval();
  log.info('next poll in %d ms (stableCycles=%d)', nextInterval, _stableCycles);
  _pollerTimer = setTimeout(() => scheduleNextRefresh(false), nextInterval);
}

export function stopPoller() {
  if (_pollerTimer) {
    clearTimeout(_pollerTimer);
    _pollerTimer = null;
    _pollerStopped = true;
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

    const active = botCakeEndpoints.filter(ep => shouldAttempt('botcake:' + ep.id));
    for (const ep of botCakeEndpoints) {
      if (getBreakerState('botcake:' + ep.id)?.state === 'OPEN') {
        const st = getBreakerState('botcake:' + ep.id)!;
        const remaining = Math.max(0, st.cooldownMs - (Date.now() - st.lastFailureTime));
        log.warn('circuit open for botcake endpoint %s, skipping (retry in %dms)', ep.name, remaining);
      }
    }

    await Promise.all(active.map(async (ep) => {
      const key = 'botcake:' + ep.id;
      try {
        const ok = await refreshSingleBotCake(ep);
        if (ok) {
          cbRecordSuccess(key);
        } else {
          recordFailure(key);
        }
      } catch (err) {
        recordFailure(key);
        log.error({ err, ep: ep.name }, 'botcake: endpoint refresh failed');
        void addNotification('external_error', 'warning', `BotCake Refresh Failed: ${ep.name}`, err instanceof Error ? err.message : String(err));
      }
    }));
  } catch (err) {
    log.error({ err }, 'botcake: unexpected error in refreshBotCake');
  } finally {
    _refreshingBotCake = false;
  }
}

async function refreshSingleBotCake(endpoint: EndpointRow): Promise<boolean> {
  if (!endpoint.access_token) return true;
  if (!endpoint.fb_page_id) {
    log.warn({ ep: endpoint.name }, 'botcake: no fb_page_id configured, skipping');
    return false;
  }
  const fbPageId = endpoint.fb_page_id;

  const fetchStart = Date.now();
  let bcResult: { pages: BotCakePage[]; authFailure: boolean };
  try {
    bcResult = await fetchBotCakePages(endpoint.access_token, fbPageId);
    if (bcResult.authFailure) {
      void addNotification('credential_change', 'critical', `BotCake Token Expired: ${endpoint.name}`, `The access token for "${endpoint.name}" returned 401. Generate a new token and update it in Settings > Endpoints.`);
    }
    recordBotCakeApiHealth(endpoint.id, true, Date.now() - fetchStart, null);
  } catch (err) {
    recordBotCakeApiHealth(endpoint.id, false, Date.now() - fetchStart, err instanceof Error ? err.message : String(err));
    log.error({ err, ep: endpoint.name }, 'botcake: fetchBotCakePages failed');
    void addNotification('external_error', 'warning', `BotCake API Error: ${endpoint.name}`, err instanceof Error ? err.message : String(err));
    return false;
  }
  if (bcResult.pages.length === 0) {
    if (bcResult.authFailure) return false;
    log.warn({ ep: endpoint.name }, 'botcake: API returned 0 pages — skipping insert');
    void addNotification('external_error', 'warning', 'BotCake API Returned 0 Pages', `Endpoint "${endpoint.name}" returned 0 pages during refresh. Skipping insert.`);
    return false;
  }
  const runId = `botcake_refresh_${Date.now()}_${endpoint.id}`;
  const ts = new Date().toISOString();

  const pancakeActive = await getPancakeActivePageIds();

  const noOrders = bcResult.pages.filter(p => !pancakeActive.has(p.page_id)).map(p => p.page_id);
  const [convResult, toolsActive] = await Promise.all([
    checkBotCakeConversations(noOrders, endpoint.access_token, fbPageId),
    checkBotCakeToolsFlows(noOrders, endpoint.access_token, fbPageId),
  ]);

  let activePages: SlimPage[] = [];
  let inactivePages: SlimPage[] = [];

  for (const p of bcResult.pages) {
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
    total_pages: bcResult.pages.length,
    active_pages_count: activePages.length,
    inactive_pages_count: inactivePages.length,
    receiver_sd_size_bytes: null,
    raw_summary: {
      source: 'botcake-refresh',
      page_count: bcResult.pages.length,
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
    log.info('botcake %s: %dA (%dorders+%dconv+%dtools) / %dI — %d total, run %s', endpoint.name, activePages.length, pa, hc, ht, na, bcResult.pages.length, runId);
  }
  return true;
}

async function refreshPancake() {
  if (_refreshingPancake) return;

  if (!shouldAttempt('pancake')) {
    const st = getBreakerState('pancake');
    const remaining = st ? Math.max(0, st.cooldownMs - (Date.now() - st.lastFailureTime)) : 0;
    log.warn('circuit open for pancake, skipping (retry in %dms)', remaining);
    return;
  }

  _refreshingPancake = true;
  let endpoints: EndpointRow[] = [];
  let overallSuccess = false;
  try {
  const allEndpoints = await listEndpoints();
  endpoints = allEndpoints.filter(ep => !isBotCakeEndpoint(ep) && ep.url && ep.access_token && ep.is_active);
  if (endpoints.length === 0) { overallSuccess = true; return; }

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
      overallSuccess = false;
      return;
    }
    log.info('pancake: using cached shops data (%d shops)', shops.length);
  }

  shops = mergePagesActivation(shops, pagesApi);

  const shopById = new Map(shops.filter(s => TARGET_SHOP_IDS.includes(s.id)).map(s => [s.id, s]));

  const activePageIdsByShop = new Map<number, Set<string>>();
  let anyShopHadData = false;

  async function restoreFromPreviousRun(sid: number, target: Map<number, Set<string>>): Promise<Set<string>> {
    const prevRun = (await pool.query(`
      SELECT run_id FROM runs
      WHERE endpoint_id = $1 AND (active_pages > 0 OR active_pages IS NULL)
      ORDER BY generated_at DESC LIMIT 1
    `, [String(sid)])).rows[0] as { run_id: string } | undefined;
    if (!prevRun) {
      const empty = new Set<string>();
      target.set(sid, empty);
      return empty;
    }
    const prevActive = (await pool.query('SELECT page_id FROM page_states WHERE run_id = $1 AND is_activated IS TRUE', [prevRun.run_id])).rows as { page_id: string }[];
    const ids = new Set(prevActive.map(p => p.page_id));
    if (ids.size > 0) {
      target.set(sid, ids);
      log.info('pancake: restored %d active pages from previous run for shop %d', ids.size, sid);
    } else {
      target.set(sid, new Set<string>());
    }
    return ids;
  }

  await Promise.all(TARGET_SHOP_IDS.map(async (sid) => {
    const shopKey = `pancake:shop:${sid}`;
    const combined = new Set<string>();

    // Per-shop circuit breaker: skip API calls if circuit is OPEN, use fallback data
    if (!shouldAttempt(shopKey)) {
      const st = getBreakerState(shopKey);
      const remaining = st ? Math.max(0, st.cooldownMs - (Date.now() - st.lastFailureTime)) : 0;
      log.warn('circuit open for pancake shop %d, falling back to previous run data (retry in %dms)', sid, remaining);
      const ids = await restoreFromPreviousRun(sid, activePageIdsByShop);
      if (ids.size > 0) anyShopHadData = true;
      return;
    }

    let shopFailed = false;
    try {
      const orderIds = await fetchPancakeActivePageIds(token, sid);
      for (const id of orderIds) combined.add(id);
    } catch (err) {
      shopFailed = true;
      log.error({ err, shopId: sid }, 'pancake: orders failed for shop %d', sid);
    }
    try {
      const customerIds = await fetchPancakeActivePageIdsFromCustomers(token, sid);
      for (const id of customerIds) combined.add(id);
    } catch (err) {
      shopFailed = true;
      log.error({ err, shopId: sid }, 'pancake: customers failed for shop %d', sid);
    }

    if (shopFailed) {
      const prevState = getBreakerState(shopKey);
      recordFailure(shopKey);
      // Only notify on transition (CLOSED→failing or HALF_OPEN→failing), not on repeated OPEN failures
      if (!prevState || prevState.state === 'CLOSED' || prevState.state === 'HALF_OPEN') {
        void addNotification('external_error', 'info', `Shop Fetch Failed: ${sid}`, 'Failed to fetch orders/customers from Pancake API for this shop.');
      }
      // Restore previous run data so the dashboard shows continuity instead of 0 active pages
      const ids = await restoreFromPreviousRun(sid, activePageIdsByShop);
      if (ids.size > 0) anyShopHadData = true;
      return;
    }

    cbRecordSuccess(shopKey);
    if (combined.size > 0) anyShopHadData = true;
    activePageIdsByShop.set(sid, combined);
  }));

  // Global fallback: if every shop returned 0 data (not from circuit fallback), restore from previous runs
  if (!anyShopHadData) {
    log.warn('pancake: all shops returned 0 active pages — likely network/DNS issue, falling back to previous good run data');
    void addNotification('external_error', 'warning', 'Pancake API Returned 0 Active Pages', 'All shops returned 0 active pages — falling back to previous run data');
    for (const sid of TARGET_SHOP_IDS) {
      await restoreFromPreviousRun(sid, activePageIdsByShop);
    }
  }

  await Promise.all(endpoints.map(async (ep) => {
    const shopId = parseInt(ep.id, 10);
    const shop = shopById.get(shopId);
    if (!shop) return;
    try {
      const orderPageIds = activePageIdsByShop.get(shopId) ?? new Set<string>();

      const ts = new Date().toISOString();
      const runId = `pancake_refresh_${Date.now()}_${ep.id}`;

      const activePages: SlimPage[] = [];
      const inactivePages: SlimPage[] = [];
      for (const p of shop.pages) {
        const hasOrders = orderPageIds.has(p.id);
        const apiActive = p.is_activated === true;
        const activation_reason = hasOrders ? 'pancake-activity' : (apiActive ? 'api-active' : 'no-activity');
        const base = {
          shop_label: ep.shop_label ?? null, shop: ep.shop_label ?? null,
          name: p.name,
          page_id: p.id, id: p.id,
          activity_kind: null, kind: null,
          activation_reason, reason: null,
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
    } catch (err) {
      log.error({ err, ep: ep.name }, 'pancake: endpoint refresh failed');
    }
  }));
  overallSuccess = true;
  } catch (err) {
    log.error({ err }, 'pancake: refresh failed');
    const epNames = endpoints.length > 0 ? endpoints.map(e => e.name).join(', ') : 'unknown';
    void addNotification('external_error', 'warning', 'Pancake Refresh Failed', `Pancake refresh error for [${epNames}]: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    _refreshingPancake = false;
    if (overallSuccess) {
      cbRecordSuccess('pancake');
    } else {
      recordFailure('pancake');
    }
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

export async function triggerBotCakeRefresh(endpointId: string): Promise<boolean> {
  invalidateBotCakeCaches();
  const endpoints = (await listEndpoints()).filter(ep => ep.id === endpointId);
  for (const ep of endpoints) {
    const ok = await refreshSingleBotCake(ep);
    if (ok) {
      cbRecordSuccess('botcake:' + ep.id);
    }
    log.info('webhook: botcake refresh for %s completed', ep.name);
    return ok;
  }
  return false;
}

export async function triggerPancakeRefresh(): Promise<void> {
  await refreshPancake();
  log.info('webhook: pancake refresh triggered');
}
