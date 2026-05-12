import { getSetting, setSetting } from './db';
import { refreshAll } from './poller';

const SCHEDULER_POLL_MS = 5_000;

let _started = false;

export function startScheduler() {
  if (_started) return;
  _started = true;
  console.log('[scheduler] starting; polling interval =', SCHEDULER_POLL_MS, 'ms');

  setInterval(() => {
    checkAndRun().catch(err => console.error('[scheduler] Error in checkAndRun:', err));
  }, SCHEDULER_POLL_MS);
}

export async function checkAndRun() {
  const intervalStr = getSetting('schedule_interval');

  if (!intervalStr || intervalStr === 'off') {
    return;
  }

  const intervalMs = parseInt(intervalStr, 10);
  if (isNaN(intervalMs)) {
    return;
  }

  const lastRunStr = getSetting('last_scheduled_run');
  const lastRunMs = lastRunStr ? parseInt(lastRunStr, 10) : 0;
  const now = Date.now();

  if (now - lastRunMs >= intervalMs) {
    console.log('[scheduler] Triggering platform refresh... interval:', intervalMs, 'ms');
    setSetting('last_scheduled_run', now.toString());
    setSetting('last_trigger_time', now.toString());

    await refreshAll();
  }
}
