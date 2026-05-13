import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { checkAndRun } from '@/lib/scheduler';
import { pollIfNeeded } from '@/lib/poller';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
  try {
    void checkAndRun().catch(e => console.error('[lazy-cron] scheduler err:', e));
    void pollIfNeeded().catch(e => console.error('[lazy-cron] poller err:', e));

    const lastTriggerTimeStr = getSetting('last_trigger_time');
    const lastTriggerTime = lastTriggerTimeStr ? parseInt(lastTriggerTimeStr, 10) : 0;

    const now = Date.now();
    const isRunning = (now - lastTriggerTime) < 15000;

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
