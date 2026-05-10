// Background polling worker.
// Polls the n8n receiver every POLL_INTERVAL_MS and inserts new snapshots into SQLite.
// Idempotent — same run_id is skipped on subsequent polls.

import { fetchReceiverStatus } from './receiver';
import { insertSnapshot } from './db';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

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

async function runOne() {
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
    }
  } catch (err) {
    console.error('[poller] insert failed:', err);
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
