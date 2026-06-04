import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { pruneOldRuns } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { PruneSchema } from '@/lib/schemas';

export const POST = withAuth(async (req: Request) => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = PruneSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const deleted = await pruneOldRuns(parsed.data.retention_days);
    return NextResponse.json({ ok: true, deleted });
});
