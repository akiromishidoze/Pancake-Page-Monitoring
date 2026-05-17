import { getSetting, setSetting, pruneOldRuns } from './db';
import { refreshAll } from './poller';

const SCHEDULER_POLL_MS = 5_000;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let _started = false;

export async function startScheduler() {
  if (_started) return;
  _started = true;
  console.log('[scheduler] starting; polling interval =', SCHEDULER_POLL_MS, 'ms');

  // Ensure a retention policy is set by default
  if (!(await getSetting('retention_days'))) {
    await setSetting('retention_days', '90');
    console.log('[scheduler] default retention_days set to 90');
  }

  setInterval(() => {
    checkAndRun().catch(err => console.error('[scheduler] Error in checkAndRun:', err));
  }, SCHEDULER_POLL_MS);

  setInterval(() => {
    checkBackup().catch(err => console.error('[scheduler] Backup error:', err));
  }, 60_000);

  setInterval(() => {
    checkPrune().catch(err => console.error('[scheduler] Prune error:', err));
  }, 60_000);
}

async function checkBackup() {
  const last = await getSetting('last_backup_time');
  const lastMs = last ? parseInt(last, 10) : 0;
  const now = Date.now();
  if (now - lastMs < BACKUP_INTERVAL_MS) return;

  try {
    const { backup } = await import('./backup');
    const file = backup();
    await setSetting('last_backup_time', now.toString());
    console.log('[scheduler] backup created:', file);
  } catch (err) {
    console.error('[scheduler] backup failed:', err);
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
      console.log(`[scheduler] pruned ${deleted} runs older than ${retentionDays} days`);
    }
  } catch (err) {
    console.error('[scheduler] prune failed:', err);
  }
}

export async function checkAndRun() {
  const intervalStr = await getSetting('schedule_interval');

  if (!intervalStr || intervalStr === 'off') {
    return;
  }

  const intervalMs = parseInt(intervalStr, 10);
  if (isNaN(intervalMs)) {
    return;
  }

  const lastRunStr = await getSetting('last_scheduled_run');
  const lastRunMs = lastRunStr ? parseInt(lastRunStr, 10) : 0;
  const now = Date.now();

  if (now - lastRunMs >= intervalMs) {
    console.log('[scheduler] Triggering platform refresh... interval:', intervalMs, 'ms');
    await setSetting('last_scheduled_run', now.toString());
    await setSetting('last_trigger_time', now.toString());

    await refreshAll();
  }
}
