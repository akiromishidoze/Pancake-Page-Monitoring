// POST /api/ingest — standalone receiver endpoint for monitoring snapshots.
// External systems (n8n workflows, scripts, etc.) POST their data here.
// Authenticated via X-Api-Key header matched against the endpoints table.

import { NextResponse } from 'next/server';
import { getEndpointByApiKey, insertSnapshot, touchEndpoint } from '@/lib/db';

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-Api-Key');
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Missing X-Api-Key header' }, { status: 401 });
  }

  const endpoint = getEndpointByApiKey(apiKey);
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: 'Invalid or inactive API key' }, { status: 401 });
  }

  if (endpoint.token_expires_at && new Date(endpoint.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: 'API key has expired' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const run_id = body.run_id || body.generated_at || `ingest_${Date.now()}`;
  const rows = body.rows ?? [];
  const summary = body.summary ?? {};
  const activePages = [];
  const inactivePages = [];

  for (const r of rows) {
    const isAct = r.is_activated === true;
    const slim = {
      shop_label: r.shop_label,
      shop: r.shop_label,
      name: r.page_name ?? r.name ?? 'Unknown',
      page_id: r.page_id ?? r.id ?? '',
      id: r.page_id ?? r.id ?? '',
      activity_kind: r.activity_kind ?? r.kind ?? null,
      kind: r.activity_kind ?? r.kind ?? null,
      activation_reason: r.activation_reason ?? r.reason ?? null,
      reason: r.activation_reason ?? r.reason ?? null,
      last_order_at: r.last_order_at ?? null,
      last_customer_activity_at: r.last_customer_activity_at ?? null,
      state_change: r.state_change ?? null,
      activity_kind_change: r.activity_kind_change ?? null,
      is_canary: r.is_canary === true,
      response_ms: r.response_ms ?? null,
      fetch_errors: typeof r.fetch_errors === 'number' ? r.fetch_errors : 0,
    };
    (isAct ? activePages : inactivePages).push(slim);
  }

  try {
    const result = insertSnapshot({
      run_id,
      endpoint_id: endpoint.id,
      generated_at: body.generated_at ?? new Date().toISOString(),
      heartbeat_ok: body.status === 'fresh',
      run_quality: summary.run_quality ?? null,
      severity: summary.severity ?? null,
      canary_status: summary.canary_status ?? null,
      canary_alert: summary.canary_alert ?? false,
      outage_suspected: summary.outage_suspected ?? false,
      alert_count: summary.alert_count ?? 0,
      rule_version: summary.rule_version ?? null,
      in_maintenance_window: summary.in_maintenance_window ?? false,
      total_pages: rows.length,
      active_pages_count: activePages.length,
      inactive_pages_count: inactivePages.length,
      receiver_sd_size_bytes: null,
      raw_summary: body,
      active_pages: activePages,
      inactive_pages: inactivePages,
    });

    if (result.inserted) {
      touchEndpoint(endpoint.id);
    }

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      endpoint: endpoint.name,
      run_id,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
