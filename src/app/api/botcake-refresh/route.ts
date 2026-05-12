// POST /api/botcake-refresh — triggered by scheduler/webhook to fetch BotCake data and store in DB
// GET  /api/botcake-refresh?key=<api_key> — convenience for cron/curl

import { NextResponse } from 'next/server';
import { getEndpointByApiKey, insertSnapshot } from '@/lib/db';
import { fetchBotCakePages } from '@/lib/botcake';

async function handler(apiKey: string | null) {
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Missing X-Api-Key header or ?key=' }, { status: 401 });
  }

  const endpoint = getEndpointByApiKey(apiKey);
  if (!endpoint || endpoint.id !== 'botcake-platform') {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!endpoint.access_token) {
    return NextResponse.json({ ok: false, error: 'BotCake endpoint has no access_token configured' }, { status: 400 });
  }

  const pages = await fetchBotCakePages(endpoint.access_token);
  const runId = `botcake_refresh_${Date.now()}`;
  const now = new Date().toISOString();

  const activePages = pages.map((p) => ({
    page_id: p.page_id,
    id: p.page_id,
    name: p.name,
    shop_label: null as string | null,
    shop: null as string | null,
    activity_kind: null as string | null,
    kind: null as string | null,
    is_activated: true,
    is_canary: false,
    activation_reason: null as string | null,
    reason: null as string | null,
    state_change: null as string | null,
    activity_kind_change: null as string | null,
    last_order_at: null as string | null,
    last_customer_activity_at: null as string | null,
    response_ms: null as number | null,
    fetch_errors: 0,
  }));

  const result = insertSnapshot({
    run_id: runId,
    endpoint_id: 'botcake-platform',
    generated_at: now,
    heartbeat_ok: true,
    run_quality: 'full',
    severity: null,
    canary_status: 'ok',
    canary_alert: false,
    outage_suspected: false,
    alert_count: 0,
    rule_version: null,
    in_maintenance_window: false,
    total_pages: pages.length,
    active_pages_count: pages.length,
    inactive_pages_count: 0,
    receiver_sd_size_bytes: null,
    raw_summary: { source: 'botcake-refresh', page_count: pages.length },
    active_pages: activePages,
    inactive_pages: [],
  });

  return NextResponse.json({
    ok: true,
    run_id: runId,
    pages: pages.length,
    inserted: result.inserted,
  });
}

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-Api-Key');
  return handler(apiKey);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('key');
  return handler(apiKey);
}
