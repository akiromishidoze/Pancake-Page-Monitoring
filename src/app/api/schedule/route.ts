import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';

export async function GET() {
  try {
    const interval = getSetting('schedule_interval') || 'off';
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

    setSetting('schedule_interval', interval);
    
    // Reset the last run time so the new schedule begins its countdown immediately
    setSetting('last_scheduled_run', Date.now().toString());

    return NextResponse.json({ ok: true, interval });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
