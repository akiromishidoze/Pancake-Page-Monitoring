import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { ScheduleSchema } from '@/lib/schemas';

export async function GET() {
  try {
    const interval = (await getSetting('schedule_interval')) || 'off';
    return NextResponse.json({ ok: true, interval });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = ScheduleSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { interval } = parsed.data;
    await setSetting('schedule_interval', interval);
    await setSetting('last_scheduled_run', Date.now().toString());

    return NextResponse.json({ ok: true, interval });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
