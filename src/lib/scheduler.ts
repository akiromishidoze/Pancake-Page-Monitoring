import { getSetting, setSetting } from './db';

const SCHEDULER_POLL_MS = 5_000; // Check every 5 seconds

let _started = false;

export function startScheduler() {
  if (_started) return;
  _started = true;
  console.log('[scheduler] starting; polling interval =', SCHEDULER_POLL_MS, 'ms');

  // Do not run immediately on boot to avoid spamming the webhook,
  // let the interval handle it.
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
    console.log('[scheduler] Triggering scheduled run... interval:', intervalMs, 'ms');
    
    // Optimistically update the last run time to prevent double-firing
    // if the fetch takes longer than the polling interval
    setSetting('last_scheduled_run', now.toString());
    setSetting('last_trigger_time', now.toString()); // Record for the UI loading phase
    
    await triggerRun();
  }
}

async function triggerRun() {
  const url = process.env.RUN_TRIGGER_URL;
  const secret = process.env.MONITOR_SECRET;
  
  if (!url || !secret) {
    console.error('[scheduler] Error: RUN_TRIGGER_URL or MONITOR_SECRET env var not set.');
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Monitor-Secret': secret,
      },
      body: JSON.stringify({ source: 'scheduler', triggered_at: new Date().toISOString() }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn('[scheduler] n8n responded with error:', res.status, text.slice(0, 200));
    } else {
      console.log('[scheduler] Triggered successfully.');
    }
  } catch (e) {
    console.error('[scheduler] Failed to trigger run:', e instanceof Error ? e.message : String(e));
  }
}
