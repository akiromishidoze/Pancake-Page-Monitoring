import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { pruneOldRuns } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const body = await req.json();
    const days = parseInt(body.retention_days, 10);
    if (isNaN(days) || days <= 0) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'retention_days must be a positive number', 400);
    }

    const deleted = await pruneOldRuns(days);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return apiCatch(e);
  }
}
