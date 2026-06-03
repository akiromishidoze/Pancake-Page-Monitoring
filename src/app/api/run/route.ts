import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { refreshAll } from '@/lib/poller';
import { setSetting } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const POST = withAuth(async () => {
    const nowStr = Date.now().toString();
    await setSetting('last_trigger_time', nowStr);
    await setSetting('last_scheduled_run', nowStr);

    await refreshAll();

    return NextResponse.json({
      ok: true,
      message: 'Platforms refreshed. New data should appear within seconds.',
      triggered_at: new Date().toISOString(),
    });
});
