import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { getRunCount, getSetting } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const GET = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  const [runCount, lastBackfill] = await Promise.all([
    getRunCount(),
    getSetting('last_backfill_at'),
  ]);

  return NextResponse.json({
    ok: true,
    db_run_count: runCount,
    last_backfill_at: lastBackfill,
    note: 'Backfill is managed automatically by the platform poller. External systems can POST historical data to /api/ingest.',
  });
});

export const POST = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    return NextResponse.json({
      ok: true,
      inserted: 0,
      message: 'Backfill is automatic. Platform data is refreshed by the built-in poller every 60s. Push historical snapshots to /api/ingest if needed.',
    });
});
