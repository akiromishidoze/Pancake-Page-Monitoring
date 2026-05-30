import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const val = await getSetting('last_scheduled_run');
  return NextResponse.json({ ok: true, lastScheduledRun: val ? parseInt(val, 10) : null });
}
