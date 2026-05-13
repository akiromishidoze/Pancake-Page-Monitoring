import { fetchBotCakePages } from './botcake';
import { getEndpoint, insertSnapshot, getSetting, setSetting, listEndpoints, type SlimPage } from './db';
import { broadcastSSE } from './sse';

const POLL_INTERVAL_MS = 60_000;
const PANCAKE_API_PATH_DEFAULT = '/api/monitoring/pages';

let _started = false;
let _lastPolledAt: string | null = null;

let _botcakeLastRefresh = 0;
let _pancakeLastRefresh = 0;

export function startPoller() {
  if (_started) return;
  _started = true;
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
  const now = Date.now();
  if (now - _pancakeLastRefresh < POLL_INTERVAL_MS) return;
  _pancakeLastRefresh = now;

  const apiPath = getSetting('pancake_api_path') || PANCAKE_API_PATH_DEFAULT;
  const endpoints = listEndpoints().filter(ep => ep.id !== 'botcake-platform' && ep.url && ep.access_token && ep.is_active);

  for (const ep of endpoints) {
    if (!ep.url) continue;
    try {
      const baseUrl = ep.url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}${apiPath}`, {
        headers: { Authorization: `Bearer ${ep.access_token}`, 'Content-Type': 'application/json' },
      });

      if (!res.ok) { console.warn(`[poller] pancake ${ep.name}: HTTP ${res.status}`); continue; }

      const data = await res.json();
      const runId = `pancake_refresh_${now}_${ep.id}`;
      const ts = new Date().toISOString();

      let rows: Array<Record<string, unknown>> = [];
      if (Array.isArray(data)) rows = data;
      else if (data.rows && Array.isArray(data.rows)) rows = data.rows as Array<Record<string, unknown>>;
      else if (data.pages && Array.isArray(data.pages)) rows = data.pages as Array<Record<string, unknown>>;
      else if (data.data && Array.isArray(data.data)) rows = data.data as Array<Record<string, unknown>>;
      else { console.warn(`[poller] pancake ${ep.name}: unexpected response format`); continue; }

      const activePages: SlimPage[] = [];
      const inactivePages: SlimPage[] = [];
      for (const r of rows) {
        const isAct = r.is_activated !== false;
        const slim: SlimPage = {
          shop_label: ep.shop_label ?? null, shop: ep.shop_label ?? null,
          name: (r.page_name as string) ?? (r.name as string) ?? (r.page_id as string) ?? 'Unknown',
          page_id: (r.page_id as string) ?? (r.id as string) ?? '', id: (r.page_id as string) ?? (r.id as string) ?? '',
          activity_kind: (r.activity_kind as string | null) ?? (r.kind as string | null) ?? null, kind: (r.activity_kind as string | null) ?? (r.kind as string | null) ?? null,
          activation_reason: (r.activation_reason as string | null) ?? (r.reason as string | null) ?? null, reason: (r.activation_reason as string | null) ?? (r.reason as string | null) ?? null,
          last_order_at: (r.last_order_at as string | null) ?? null, last_customer_activity_at: (r.last_customer_activity_at as string | null) ?? null,
          state_change: (r.state_change as string | null) ?? null, activity_kind_change: (r.activity_kind_change as string | null) ?? null,
          is_canary: r.is_canary === true,
          response_ms: (r.response_ms as number | null) ?? (r.response_time_ms as number | null) ?? null,
          fetch_errors: typeof r.fetch_errors === 'number' ? r.fetch_errors : 0,
        };
        (isAct ? activePages : inactivePages).push(slim);
      }

      const result = insertSnapshot({
        run_id: runId, endpoint_id: ep.id, generated_at: ts,
        heartbeat_ok: true, run_quality: 'full', severity: null,
        canary_status: 'ok', canary_alert: false, outage_suspected: false, alert_count: 0,
        rule_version: null, in_maintenance_window: false,
        total_pages: rows.length, active_pages_count: activePages.length, inactive_pages_count: inactivePages.length,
        receiver_sd_size_bytes: null,
        raw_summary: { source: 'pancake-poller', endpoint: ep.name, page_count: rows.length },
        active_pages: activePages, inactive_pages: inactivePages,
      });

      if (result.inserted) {
        console.log(`[poller] pancake ${ep.name}: inserted ${rows.length} pages, run ${runId}`);
        broadcastSSE('refresh', JSON.stringify({ source: 'pancake-poller', run_id: runId, endpoint_id: ep.id }));
      }
    } catch (err) {
      console.error(`[poller] pancake ${ep.name}: error:`, err);
    }
  }
}

export function getPollerStatus() {
  return {
    started: _started,
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
