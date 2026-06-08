import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { pruneOldRuns, logAuditEntry } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { PruneSchema } from '@/lib/schemas';
import { getClientIp } from '@/lib/rate-limit';

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
    const ip = getClientIp(req);
    void logAuditEntry('prune_runs', 'system', 'prune', `Pruned runs older than ${parsed.data.retention_days} days (${deleted} rows)`, ip);

    return NextResponse.json({ ok: true, deleted });
});
