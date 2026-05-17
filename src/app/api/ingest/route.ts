// POST /api/ingest — standalone receiver endpoint for monitoring snapshots.
// External systems (scripts, CI/CD, etc.) POST their data here.
// Authenticated via X-Api-Key header matched against the endpoints table.

import { NextResponse } from 'next/server';
import { getEndpointByApiKey, insertSnapshot, touchEndpoint, type SlimPage } from '@/lib/db';
import { checkAlertsForRun } from '@/lib/notify';
import { broadcastSSE } from '@/lib/sse';
import { cors, corsOptions } from '@/lib/cors';

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-Api-Key');
  if (!apiKey) {
    return cors(NextResponse.json({ ok: false, error: 'Missing X-Api-Key header' }, { status: 401 }));
  }

  const endpoint = await getEndpointByApiKey(apiKey);
  if (!endpoint) {
    return cors(NextResponse.json({ ok: false, error: 'Invalid or inactive API key' }, { status: 401 }));
  }

  if (endpoint.token_expires_at && new Date(endpoint.token_expires_at) < new Date()) {
    return cors(NextResponse.json({ ok: false, error: 'API key has expired' }, { status: 401 }));
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return cors(NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }));
  }

  const run_id = (body.run_id as string) || (body.generated_at as string) || `ingest_${Date.now()}`;
  const rows = (body.rows as Array<Record<string, unknown>>) ?? [];
  const summary = (body.summary as Record<string, unknown>) ?? {};
  const activePages: SlimPage[] = [];
  const inactivePages: SlimPage[] = [];

  for (const r of rows) {
    const isAct = r.is_activated === true;
    const slim: SlimPage = {
      shop_label: r.shop_label as string | null | undefined,
      shop: r.shop_label as string | null | undefined,
      name: (r.page_name as string) ?? (r.name as string) ?? 'Unknown',
      page_id: (r.page_id as string) ?? (r.id as string) ?? '',
      id: (r.page_id as string) ?? (r.id as string) ?? '',
      activity_kind: (r.activity_kind as string | null) ?? (r.kind as string | null) ?? null,
      kind: (r.activity_kind as string | null) ?? (r.kind as string | null) ?? null,
      activation_reason: (r.activation_reason as string | null) ?? (r.reason as string | null) ?? null,
      reason: (r.activation_reason as string | null) ?? (r.reason as string | null) ?? null,
      last_order_at: (r.last_order_at as string | null) ?? null,
      last_customer_activity_at: (r.last_customer_activity_at as string | null) ?? null,
      state_change: (r.state_change as string | null) ?? null,
      activity_kind_change: (r.activity_kind_change as string | null) ?? null,
      is_canary: r.is_canary === true,
      response_ms: (r.response_ms as number | null) ?? null,
      fetch_errors: typeof r.fetch_errors === 'number' ? r.fetch_errors : 0,
    };
    (isAct ? activePages : inactivePages).push(slim);
  }

  try {
    const result = await insertSnapshot({
      run_id,
      endpoint_id: endpoint.id,
      generated_at: (body.generated_at as string) ?? new Date().toISOString(),
      heartbeat_ok: body.status === 'fresh',
      run_quality: (summary.run_quality as string) ?? null,
      severity: (summary.severity as string) ?? null,
      canary_status: (summary.canary_status as string) ?? null,
      canary_alert: (summary.canary_alert as boolean) ?? false,
      outage_suspected: (summary.outage_suspected as boolean) ?? false,
      alert_count: (summary.alert_count as number) ?? 0,
      rule_version: (summary.rule_version as number) ?? null,
      in_maintenance_window: (summary.in_maintenance_window as boolean) ?? false,
      total_pages: rows.length,
      active_pages_count: activePages.length,
      inactive_pages_count: inactivePages.length,
      receiver_sd_size_bytes: null,
      raw_summary: body,
      active_pages: activePages,
      inactive_pages: inactivePages,
    });

    if (result.inserted) {
      await touchEndpoint(endpoint.id);
      broadcastSSE('refresh', JSON.stringify({ source: 'ingest', run_id, endpoint_id: endpoint.id }));
      // Fire-and-forget alert check for the new run
      checkAlertsForRun(run_id).catch(e => console.error('[ingest] alert check error:', e));
    }

    return cors(NextResponse.json({
      ok: true,
      inserted: result.inserted,
      endpoint: endpoint.name,
      run_id,
    }));
  } catch (e) {
    return cors(NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    ));
  }
}

export async function OPTIONS() {
  return corsOptions();
}
