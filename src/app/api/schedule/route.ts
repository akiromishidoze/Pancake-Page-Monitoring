import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';

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
    const body = await req.json();
    const { interval } = body;
    
    if (typeof interval !== 'string') {
      return NextResponse.json({ ok: false, error: 'Invalid interval' }, { status: 400 });
    }

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
