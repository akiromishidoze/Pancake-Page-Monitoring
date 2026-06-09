// POST /api/ingest — standalone receiver endpoint for monitoring snapshots.
// External systems (scripts, CI/CD, etc.) POST their data here.
// Authenticated via X-Api-Key header matched against the endpoints table.

import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { getEndpointByApiKey, insertSnapshot, touchEndpoint, toSlimPage, type SlimPage } from '@/lib/db';
import { checkAlertsForRun } from '@/lib/notify';
import { broadcastSSE } from '@/lib/sse';
import { corsReflectOrigin, corsOptions } from '@/lib/cors';
import { IngestBodySchema } from '@/lib/schemas';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('ingest');

function isAllowedIp(ip: string): boolean {
  const allowed = process.env['INGEST_IP_ALLOWLIST'];
  if (!allowed) return true;
  return allowed.split(',').map(s => s.trim()).some(a => a === ip || a === '0.0.0.0/0');
}

function respond(res: NextResponse, req: Request): NextResponse {
  return corsReflectOrigin(res, req.headers.get('origin'));
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!isAllowedIp(ip)) {
    return respond(apiError(ErrorCodes.FORBIDDEN_IP, 'IP not allowed', 403), req);
  }

  const rateLimited = await rateLimit(ip, { store: 'ingest', max: 120 });
  if (rateLimited) return respond(rateLimited, req);

  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-Api-Key');
  if (!apiKey) {
    return respond(apiError(ErrorCodes.AUTH_REQUIRED, 'Missing X-Api-Key header', 401), req);
  }

  const endpoint = await getEndpointByApiKey(apiKey);
  if (!endpoint) {
    return respond(apiError(ErrorCodes.AUTH_KEY_INVALID, 'Invalid or inactive API key', 401), req);
  }

  if (endpoint.token_expires_at && new Date(endpoint.token_expires_at) < new Date()) {
    return respond(apiError(ErrorCodes.AUTH_KEY_EXPIRED, 'API key has expired', 401), req);
  }

  const ctErr = requireJson(req);
  if (ctErr) return respond(ctErr, req);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return respond(apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON body', 400), req);
  }

  const parsed = IngestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return respond(apiError(ErrorCodes.VALIDATION_ERROR, 'Invalid request body', 400, parsed.error.flatten()), req);
  }

  const body = parsed.data;
  const run_id = body.run_id || body.generated_at || `ingest_${Date.now()}`;
  const activePages: SlimPage[] = [];
  const inactivePages: SlimPage[] = [];

  for (const r of body.rows) {
    const slim = toSlimPage(r as Record<string, unknown>);
    ((r.is_activated === true) ? activePages : inactivePages).push(slim);
  }

  try {
    const s = body.summary;
    const result = await insertSnapshot({
      run_id,
      endpoint_id: endpoint.id,
      generated_at: body.generated_at ?? new Date().toISOString(),
      heartbeat_ok: body.status === 'fresh',
      run_quality: s.run_quality ?? null,
      severity: s.severity ?? null,
      canary_status: s.canary_status ?? null,
      canary_alert: s.canary_alert ?? false,
      outage_suspected: s.outage_suspected ?? false,
      alert_count: s.alert_count ?? 0,
      rule_version: s.rule_version ?? null,
      in_maintenance_window: s.in_maintenance_window ?? false,
      total_pages: body.rows.length,
      active_pages_count: activePages.length,
      inactive_pages_count: inactivePages.length,
      receiver_sd_size_bytes: null,
      raw_summary: raw as Record<string, unknown>,
      active_pages: activePages,
      inactive_pages: inactivePages,
    });

    if (result.inserted) {
      await touchEndpoint(endpoint.id);
      broadcastSSE('refresh', JSON.stringify({ source: 'ingest', run_id, endpoint_id: endpoint.id }));
      // Fire-and-forget alert check for the new run
      checkAlertsForRun(run_id).catch(e => log.error({ err: e }, 'alert check error'));
    }

    return respond(NextResponse.json({
      ok: true,
      inserted: result.inserted,
      endpoint: endpoint.name,
      run_id,
    }), req);
  } catch (e) {
    return respond(apiCatch(e), req);
  }
}

export async function OPTIONS() {
  return corsOptions();
}
