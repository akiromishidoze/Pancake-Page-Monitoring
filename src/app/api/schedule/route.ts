import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { getSetting, setSetting, logAuditEntry } from '@/lib/db';
import { ScheduleSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const GET = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  const interval = (await getSetting('schedule_interval')) || 'off';
  return NextResponse.json({ ok: true, interval });
});

export const POST = withAuth(async (req: Request) => {
    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'schedule', max: 5 });
    if (rateLimited) return rateLimited;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = ScheduleSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const { interval } = parsed.data;
    await setSetting('schedule_interval', interval);
    await setSetting('last_scheduled_run', Date.now().toString());

    void logAuditEntry('update_schedule', 'settings', 'schedule', `Interval set to "${interval}"`, ip);

    return NextResponse.json({ ok: true, interval });
});
