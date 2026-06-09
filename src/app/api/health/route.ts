import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { getSetting, listEndpoints, pool } from '@/lib/db';
import { cors, corsOptions } from '@/lib/cors';
import { getBotCakeApiHealth } from '@/lib/botcake';

const POLL_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = POLL_INTERVAL_MS * 2;

export async function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  const dbStart = Date.now();
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;
  try {
    await pool.query('SELECT 1');
    dbLatencyMs = Date.now() - dbStart;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
    return cors(NextResponse.json({
      ok: false,
      db: 'disconnected',
      db_error: dbError,
      db_latency_ms: null,
    }, { status: 503 }));
  }

  try {
    const allEndpoints = await listEndpoints();
    const endpoints = allEndpoints.filter(ep => ep.is_active);
    const now = Date.now();

    const checks = await Promise.all(endpoints.map(async (ep) => {
      const lastRaw = await getSetting(`poller_ok_${ep.id}`);
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
    }));

    const allOk = checks.every(c => c.ok);
    const anyData = checks.some(c => c.last_run_ms !== null);

    const botcakeHealth: Record<string, unknown> = {};
    for (const [epId, h] of getBotCakeApiHealth()) {
      botcakeHealth[epId] = {
        ok: h.ok,
        latency_ms: h.latencyMs,
        last_checked_at: h.lastCheckedAt,
        last_error: h.lastError,
        consecutive_failures: h.consecutiveFailures,
      };
    }

    return cors(NextResponse.json({
      ok: allOk && anyData,
      db: 'connected',
      db_latency_ms: dbLatencyMs,
      poll_interval_ms: POLL_INTERVAL_MS,
      stale_threshold_ms: STALE_THRESHOLD_MS,
      endpoints: checks,
      botcake_api: botcakeHealth,
    }));
  } catch (e) {
    return cors(apiCatch(e));
  }
}
