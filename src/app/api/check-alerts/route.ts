import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { getLatestRun } from '@/lib/db';
import { checkAlertsForRun } from '@/lib/notify';
import { withAuth } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const POST = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    const run = await getLatestRun();
    if (!run) {
      return apiError(ErrorCodes.NOT_FOUND, 'No runs in database', 400);
    }

    await checkAlertsForRun(run.run_id);
    return NextResponse.json({ ok: true, checked_run: run.run_id });
});
