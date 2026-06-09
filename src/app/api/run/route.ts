import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { refreshAll } from '@/lib/poller';
import { setSetting, logAuditEntry } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const POST = withAuth(async (req: Request) => {
    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'run', max: 5 });
    if (rateLimited) return rateLimited;

    const nowStr = Date.now().toString();
    await setSetting('last_trigger_time', nowStr);
    await setSetting('last_scheduled_run', nowStr);

    await refreshAll();

    void logAuditEntry('trigger_refresh', 'system', 'refresh', 'Manual poller refresh triggered', ip);

    return NextResponse.json({
      ok: true,
      message: 'Platforms refreshed. New data should appear within seconds.',
      triggered_at: new Date().toISOString(),
    });
});
