import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getSetting, setSetting } from '@/lib/db';
import { ScheduleSchema } from '@/lib/schemas';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const interval = (await getSetting('schedule_interval')) || 'off';
    return NextResponse.json({ ok: true, interval });
  } catch (e) {
    return apiCatch(e);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
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

    return NextResponse.json({ ok: true, interval });
  } catch (e) {
    return apiCatch(e);
  }
}
