import { fetchBotCakePages } from './botcake';
import { getEndpoint, insertSnapshot, getSetting, setSetting } from './db';

const POLL_INTERVAL_MS = 60_000;

let _started = false;
let _lastPolledAt: string | null = null;

let _botcakeLastRefresh = 0;

export function startPoller() {
  if (_started) return;
  _started = true;
  console.log('[poller] starting; interval =', POLL_INTERVAL_MS, 'ms');

  void refreshAll();
  setInterval(() => void refreshAll(), POLL_INTERVAL_MS);
}

export async function refreshAll() {
  _lastPolledAt = new Date().toISOString();
  await refreshBotCake();
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
      setSetting('last_scheduled_run', Date.now().toString());
    }
  } catch (err) {
    console.error('[poller] botcake: refresh failed:', err);
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
