import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApiAuth();
  if (auth) return auth;
  const val = await getSetting('last_scheduled_run');
  return NextResponse.json({ ok: true, lastScheduledRun: val ? parseInt(val, 10) : null });
}
