import { NextResponse } from 'next/server';
import { getSetting, listEndpoints } from '@/lib/db';

const POLL_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = POLL_INTERVAL_MS * 2;

export async function GET() {
  const endpoints = listEndpoints().filter(ep => ep.is_active);
  const now = Date.now();

  const checks = endpoints.map(ep => {
    const lastRaw = getSetting(`poller_ok_${ep.id}`);
    const lastMs = lastRaw ? parseInt(lastRaw, 10) : null;
    const age = lastMs !== null ? now - lastMs : null;
    const stale = age !== null && age > STALE_THRESHOLD_MS;
    return {
      endpoint_id: ep.id,
      name: ep.name,
      last_run_ms: lastMs,
      age_ms: age,
      stale,
      ok: !stale,
    };
  });

  const allOk = checks.every(c => c.ok);
  const anyData = checks.some(c => c.last_run_ms !== null);

  return NextResponse.json({
    ok: allOk && anyData,
    poll_interval_ms: POLL_INTERVAL_MS,
    stale_threshold_ms: STALE_THRESHOLD_MS,
    endpoints: checks,
  });
}
