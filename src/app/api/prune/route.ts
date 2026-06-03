import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { pruneOldRuns } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export const POST = withAuth(async (req: Request) => {
    const body = await req.json();
    const days = parseInt(body.retention_days, 10);
    if (isNaN(days) || days <= 0) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'retention_days must be a positive number', 400);
    }

    const deleted = await pruneOldRuns(days);
    return NextResponse.json({ ok: true, deleted });
});
