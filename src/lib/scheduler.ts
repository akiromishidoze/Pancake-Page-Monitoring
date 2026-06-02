import { getSetting, setSetting, pruneOldRuns, listEndpoints } from './db';
import { refreshAll } from './poller';
import { createLogger } from './logger';

const log = createLogger('scheduler');

const SCHEDULER_POLL_MS = 5_000;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;
const POLLER_HEALTH_INTERVAL_MS = 60_000;
const POLLER_GRACE_PERIOD_MS = 3 * 60_000;
const POLLER_STALE_THRESHOLD_MS = 3 * 60_000;

let _started = false;
let _serverStartTime = Date.now();
const _intervals: NodeJS.Timeout[] = [];

// In-memory cache for schedule settings to avoid 17k DB reads/day
let _cachedInterval: number | null = null;
let _cachedLastRun: number = 0;
let _cacheExpiresAt: number = 0;

async function getScheduleSettings() {
  const now = Date.now();
  if (now < _cacheExpiresAt) return { intervalMs: _cachedInterval, lastRunMs: _cachedLastRun };

  const [intervalStr, lastRunStr] = await Promise.all([
    getSetting('schedule_interval'),
    getSetting('last_scheduled_run'),
  ]);

  _cachedInterval = intervalStr && intervalStr !== 'off' ? parseInt(intervalStr, 10) : null;
  if (_cachedInterval !== null && isNaN(_cachedInterval)) _cachedInterval = null;

  _cachedLastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
  _cacheExpiresAt = now + CACHE_TTL_MS;

  return { intervalMs: _cachedInterval, lastRunMs: _cachedLastRun };
}

function invalidateCache() {
  _cacheExpiresAt = 0;
}

export async function startScheduler() {
  if (_started) return;
  _started = true;
  log.info('starting; polling interval = %d ms', SCHEDULER_POLL_MS);

  // Ensure a retention policy is set by default
  if (!(await getSetting('retention_days'))) {
    await setSetting('retention_days', '90');
    log.info('default retention_days set to 90');
  }

  _intervals.push(setInterval(() => {
    checkAndRun().catch(err => log.error({ err }, 'Error in checkAndRun'));
  }, SCHEDULER_POLL_MS));

  _intervals.push(setInterval(() => {
    checkBackup().catch(err => log.error({ err }, 'Backup error'));
  }, 60_000));

  _intervals.push(setInterval(() => {
    checkPrune().catch(err => log.error({ err }, 'Prune error'));
  }, 60_000));

  _intervals.push(setInterval(() => {
    checkSessionCleanup().catch(err => log.error({ err }, 'Session cleanup error'));
  }, 60_000));

}

export function stopScheduler() {
  if (_intervals.length > 0) {
    for (const id of _intervals) clearInterval(id);
    _intervals.length = 0;
    _started = false;
    log.info('stopped');
  }
}

async function checkBackup() {
  const last = await getSetting('last_backup_time');
  const lastMs = last ? parseInt(last, 10) : 0;
  const now = Date.now();
  if (now - lastMs < BACKUP_INTERVAL_MS) return;

  try {
    const { backup } = await import('./backup');
    const file = await backup();
    await setSetting('last_backup_time', now.toString());
    log.info('backup created: %s', file);
  } catch (err) {
    log.error({ err }, 'backup failed');
  }
}

async function checkPrune() {
  const last = await getSetting('last_prune_time');
  const lastMs = last ? parseInt(last, 10) : 0;
  const now = Date.now();
  if (now - lastMs < PRUNE_INTERVAL_MS) return;

  const retentionStr = (await getSetting('retention_days')) || '90';
  const retentionDays = parseInt(retentionStr, 10);
  if (isNaN(retentionDays) || retentionDays <= 0) return;

  try {
    const deleted = await pruneOldRuns(retentionDays);
    await setSetting('last_prune_time', now.toString());
    if (deleted > 0) {
      log.info('pruned %d runs older than %d days', deleted, retentionDays);
    }
  } catch (err) {
    log.error({ err }, 'prune failed');
  }
}

async function checkSessionCleanup() {
  const last = await getSetting('last_session_cleanup_time');
  const lastMs = last ? parseInt(last, 10) : 0;
  const now = Date.now();
  if (now - lastMs < SESSION_CLEANUP_INTERVAL_MS) return;

  try {
    const { pruneExpiredSessions } = await import('./db');
    await pruneExpiredSessions();
    await setSetting('last_session_cleanup_time', now.toString());
  } catch (err) {
    log.error({ err }, 'session cleanup failed');
  }
}

// ─── Poller health alerting ─────────────────────────────────────────

async function checkPollerHealth() {
  const now = Date.now();

  // Skip during grace period after server start
  if (now - _serverStartTime < POLLER_GRACE_PERIOD_MS) return;

  const lastRunStr = await getSetting('last_scheduled_run');
  if (!lastRunStr) return;

  const lastRunMs = parseInt(lastRunStr, 10);
  if (isNaN(lastRunMs)) return;

  const elapsed = now - lastRunMs;
  if (elapsed < POLLER_STALE_THRESHOLD_MS) return;

  // Check if there are any active endpoints to monitor
  const endpoints = await listEndpoints();
  const activeEndpoints = endpoints.filter(e => e.is_active);
  if (activeEndpoints.length === 0) return;

  // Poller is stale — send alert
  const elapsedMin = Math.round(elapsed / 60000);
  log.warn('Poller stale — no refresh for %d min', elapsedMin);

  try {
    const { sendAlert } = await import('./notify');
    await sendAlert({
      title: '⏰ Poller Stale',
      message: `No data refresh for ${elapsedMin} minutes (threshold: ${POLLER_STALE_THRESHOLD_MS / 60000} min). Active endpoints: ${activeEndpoints.length}.`,
      level: 'warning',
      platform: 'system',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error({ err }, 'Failed to send poller health alert');
  }
}

export async function checkAndRun() {
  const { intervalMs, lastRunMs } = await getScheduleSettings();

  if (intervalMs === null || intervalMs <= 0) return;

  const now = Date.now();

  if (now - lastRunMs >= intervalMs) {
    log.info('Triggering platform refresh... interval: %d ms', intervalMs);
    await setSetting('last_scheduled_run', now.toString());
    await setSetting('last_trigger_time', now.toString());
    invalidateCache();

    await refreshAll();
  }
}
