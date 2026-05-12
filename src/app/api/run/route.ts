import { NextResponse } from 'next/server';
import { refreshAll } from '@/lib/poller';
import { setSetting } from '@/lib/db';

export async function POST() {
  try {
    const nowStr = Date.now().toString();
    setSetting('last_trigger_time', nowStr);
    setSetting('last_scheduled_run', nowStr);

    await refreshAll();

    return NextResponse.json({
      ok: true,
      message: 'Platforms refreshed. New data should appear within seconds.',
      triggered_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
