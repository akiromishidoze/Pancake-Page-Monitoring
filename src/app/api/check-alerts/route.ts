import { NextResponse } from 'next/server';
import { getLatestRun } from '@/lib/db';
import { checkAlertsForRun } from '@/lib/notify';

export async function POST() {
  const run = getLatestRun();
  if (!run) {
    return NextResponse.json({ ok: false, error: 'No runs in database' }, { status: 400 });
  }

  await checkAlertsForRun(run.run_id);
  return NextResponse.json({ ok: true, checked_run: run.run_id });
}
