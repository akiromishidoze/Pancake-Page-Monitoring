import { NextResponse } from 'next/server';
import { getRunCount, getSetting } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
  const runCount = getRunCount();
  const lastBackfill = getSetting('last_backfill_at');

  return NextResponse.json({
    ok: true,
    db_run_count: runCount,
    last_backfill_at: lastBackfill,
    note: 'Backfill is managed automatically by the platform poller. External systems can POST historical data to /api/ingest.',
  });
}

export async function POST() {
  const auth = await requireApiAuth(); if (auth) return auth;
  return NextResponse.json({
    ok: true,
    inserted: 0,
    message: 'Backfill is automatic. Platform data is refreshed by the built-in poller every 60s. Push historical snapshots to /api/ingest if needed.',
  });
}
