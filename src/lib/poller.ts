// Background polling worker.
// Polls the n8n receiver every POLL_INTERVAL_MS and inserts new snapshots into SQLite.
// Also refreshes BotCake platform data on the same interval.
// Idempotent — same run_id is skipped on subsequent polls.

import { fetchReceiverStatus } from './receiver';
import { fetchBotCakePages } from './botcake';
import { getEndpoint, insertSnapshot, setSetting } from './db';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

let _botcakeLastRefresh = 0;

let _started = false;
let _lastPolledRunId: string | null = null;
let _lastPolledAt: string | null = null;

export function startPoller() {
  if (_started) return; // guard against double-start (e.g., HMR)
  _started = true;
  console.log('[poller] starting; interval =', POLL_INTERVAL_MS, 'ms');

  void runOne(); // immediate first poll
  setInterval(() => void runOne(), POLL_INTERVAL_MS);
}

export async function runOne() {
  _lastPolledAt = new Date().toISOString();
  const result = await fetchReceiverStatus({ noCache: true });

  if (!result.ok) {
    console.warn('[poller] fetch failed:', result.error);
    return;
  }

  const data = result.data;
  const h = data.latest_health;

  // Determine run_id; skip if no real run yet
  const run_id = h?.run_id ?? data.last_heartbeat_run_id ?? null;
  if (!run_id) {
    return; // nothing to record
  }

  if (run_id === _lastPolledRunId) {
    return; // nothing new
  }

  try {
    const result = insertSnapshot({
      run_id,
      generated_at: data.generated_at,
      heartbeat_ok: data.status === 'fresh',
      run_quality: h?.run_quality ?? null,
      severity: h?.severity ?? null,
      canary_status: h?.canary_status ?? null,
      canary_alert: h?.canary_alert ?? false,
      outage_suspected: h?.outage_suspected ?? false,
      alert_count: h?.alert_count ?? 0,
      rule_version: h?.rule_version ?? null,
      in_maintenance_window: h?.in_maintenance_window ?? false,
      total_pages: data.totals?.total ?? null,
      active_pages_count: data.totals?.active ?? null,
      inactive_pages_count: data.totals?.inactive ?? null,
      receiver_sd_size_bytes: data.receiver_sd_size_bytes ?? null,
      raw_summary: data,
      active_pages: data.active_pages ?? [],
      inactive_pages: data.inactive_pages ?? [],
    });

    if (result.inserted) {
      _lastPolledRunId = run_id;
      console.log('[poller] inserted run', run_id);
      // Reset the scheduler countdown to start exactly when the data is received locally
      // This ensures the UI timer jumps exactly to 14:59 after the loading sequence completes
      setSetting('last_scheduled_run', Date.now().toString());
    }
  } catch (err) {
    console.error('[poller] insert failed:', err);
  }

  // Also refresh BotCake platform data (throttled to same interval)
  await refreshBotCake();
}

async function refreshBotCake() {
  const now = Date.now();
  if (now - _botcakeLastRefresh < POLL_INTERVAL_MS) return;
  _botcakeLastRefresh = now;

  const endpoint = getEndpoint('botcake-platform');
  if (!endpoint?.access_token) {
    console.warn('[poller] botcake: no endpoint or access_token configured');
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
    }
  } catch (err) {
    console.error('[poller] botcake: refresh failed:', err);
  }
}

export function getPollerStatus() {
  return {
    started: _started,
    last_polled_at: _lastPolledAt,
    last_polled_run_id: _lastPolledRunId,
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
    await runOne();
  } finally {
    _isPolling = false;
  }
}
