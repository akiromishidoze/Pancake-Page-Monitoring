import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { checkAndRun } from '@/lib/scheduler';
import { pollIfNeeded } from '@/lib/poller';

export async function GET() {
  try {
    // Fire-and-forget: act as a lazy cron trigger whenever the dashboard is open.
    // This makes the scheduler/poller 100% resilient to Next.js dev server background task suspensions.
    void checkAndRun().catch(e => console.error('[lazy-cron] scheduler err:', e));
    void pollIfNeeded().catch(e => console.error('[lazy-cron] poller err:', e));

    const lastTriggerTimeStr = getSetting('last_trigger_time');
    const lastTriggerTime = lastTriggerTimeStr ? parseInt(lastTriggerTimeStr, 10) : 0;
    
    const now = Date.now();
    // A run typically takes ~30 seconds in n8n, plus polling delay.
    // We consider it "running" if triggered within the last 75 seconds.
    const isRunning = (now - lastTriggerTime) < 75000;

    // Calculate next run time
    const lastRunStr = getSetting('last_scheduled_run');
    const lastRunMs = lastRunStr ? parseInt(lastRunStr, 10) : 0;
    
    const intervalStr = getSetting('schedule_interval');
    const intervalMs = (intervalStr && intervalStr !== 'off') ? parseInt(intervalStr, 10) : null;
    
    const nextRunTime = (lastRunMs > 0 && intervalMs) ? lastRunMs + intervalMs : null;

    return NextResponse.json({ ok: true, isRunning, nextRunTime });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), isRunning: false },
      { status: 500 }
    );
  }
}
