import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
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
  const auth = await requireApiAuth(); if (auth) return auth;
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
