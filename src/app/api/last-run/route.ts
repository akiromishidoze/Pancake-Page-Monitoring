import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth) return auth;
  const rl = await rateLimitRoute(req); if (rl) return rl;
  const val = await getSetting('last_scheduled_run');
  return NextResponse.json({ ok: true, lastScheduledRun: val ? parseInt(val, 10) : null });
}
