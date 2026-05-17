import { NextResponse } from 'next/server';
import { pruneOldRuns } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function POST(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  try {
    const body = await req.json();
    const days = parseInt(body.retention_days, 10);
    if (isNaN(days) || days <= 0) {
      return NextResponse.json({ ok: false, error: 'retention_days must be a positive number' }, { status: 400 });
    }

    const deleted = await pruneOldRuns(days);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
