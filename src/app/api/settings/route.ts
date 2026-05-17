import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
  const retentionDays = (await getSetting('retention_days')) || '90';
  return NextResponse.json({
    ok: true,
    settings: { retention_days: retentionDays },
  });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  try {
    const body = await req.json();
    const { retention_days } = body;

    if (retention_days !== undefined) {
      const days = parseInt(retention_days, 10);
      if (isNaN(days) || days < 0) {
        return NextResponse.json({ ok: false, error: 'Invalid retention_days' }, { status: 400 });
      }
      await setSetting('retention_days', String(days));
    }

    return NextResponse.json({ ok: true, message: 'Settings updated' });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
