// GET /api/backfill — check backfill status (last backfill time, run count)
// POST /api/backfill — trigger a historical backfill
//
// Backfill sources (tried in order):
//   1. RECEIVER_HISTORY_URL — explicit history endpoint on the n8n receiver
//   2. N8N_API_URL + N8N_API_KEY — replays past executions of the monitoring workflow
//   3. RECEIVER_URL — single snapshot fallback (latest run only)

import { NextResponse } from 'next/server';
import { insertSnapshot, getRunCount, getSetting, setSetting } from '@/lib/db';

export async function GET() {
  const runCount = getRunCount();
  const lastBackfill = getSetting('last_backfill_at');
  const receiverHistoryUrl = process.env.RECEIVER_HISTORY_URL;
  const receiverUrl = process.env.RECEIVER_URL;
  const n8nApiUrl = process.env.N8N_API_URL;
  const n8nApiKey = process.env.N8N_API_KEY;

  return NextResponse.json({
    ok: true,
    db_run_count: runCount,
    last_backfill_at: lastBackfill,
    receiver_history_url_configured: !!receiverHistoryUrl,
    receiver_url_configured: !!receiverUrl,
    n8n_api_configured: !!(n8nApiUrl && n8nApiKey),
  });
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

type InsertResult = { inserted: number; skipped: number; errors: number };
type BackfillOk = { ok: true; result: InsertResult; total: number; warning?: string };

function insertSnapshots(snapshots: any[]): InsertResult {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const snap of snapshots) {
    const run_id = snap.run_id ?? snap.latest_health?.run_id ?? snap.last_heartbeat_run_id;
    if (!run_id) { errors++; continue; }
    const h = snap.latest_health ?? {};
    try {
      const result = insertSnapshot({
        run_id,
        generated_at: snap.generated_at ?? snap.captured_at ?? new Date().toISOString(),
        heartbeat_ok: snap.status === 'fresh',
        run_quality: h.run_quality ?? null,
        severity: h.severity ?? null,
        canary_status: h.canary_status ?? null,
        canary_alert: h.canary_alert ?? false,
        outage_suspected: h.outage_suspected ?? false,
        alert_count: h.alert_count ?? 0,
        rule_version: h.rule_version ?? null,
        in_maintenance_window: h.in_maintenance_window ?? false,
        total_pages: snap.totals?.total ?? null,
        active_pages_count: snap.totals?.active ?? null,
        inactive_pages_count: snap.totals?.inactive ?? null,
        receiver_sd_size_bytes: snap.receiver_sd_size_bytes ?? null,
        raw_summary: snap,
        active_pages: snap.active_pages ?? [],
        inactive_pages: snap.inactive_pages ?? [],
      });
      if (result.inserted) inserted++;
      else skipped++;
    } catch (e) {
      console.error('[backfill] insert error for run', run_id, e);
      errors++;
    }
  }

  return { inserted, skipped, errors };
}

// ─── Source 1: Receiver History Endpoint ────────────────────────────────

async function backfillFromReceiverHistory(url: string, secret: string): Promise<BackfillOk | { ok: false; error: string }> {
  const res = await fetchWithTimeout(url, {
    headers: { 'X-Monitor-Secret': secret },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `History endpoint returned HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  const body = await res.json();
  let snapshots: any[] = [];
  if (Array.isArray(body)) snapshots = body;
  else if (body.snapshots && Array.isArray(body.snapshots)) snapshots = body.snapshots;
  else if (body.ok && body.generated_at) snapshots = [body];

  const result = insertSnapshots(snapshots);
  return { ok: true, result, total: snapshots.length };
}

// ─── Source 2: n8n Executions API ───────────────────────────────────────
//
// Fetches execution metadata (302 bytes each, lightweight) and creates
// historical run entries. Page-level data accumulates forward via the
// background poller (60s interval).
//
// For full page-level history from past runs, add a history endpoint to
// the n8n receiver workflow (see BACKFILL.md).

async function backfillFromN8nExecutions(apiUrl: string, apiKey: string, workflowId: string): Promise<BackfillOk | { ok: false; error: string }> {
  const MAX_EXECUTIONS = 200;
  const headers = { 'X-N8N-API-KEY': apiKey };

  const allExecs: any[] = [];
  let cursor: string | null = null;
  while (allExecs.length < MAX_EXECUTIONS) {
    const params = new URLSearchParams({ workflowId, limit: '50', includeData: 'false' });
    if (cursor) params.set('cursor', cursor);
    const listUrl = `${apiUrl}/executions?${params}`;
    const listRes = await fetchWithTimeout(listUrl, { headers });
    if (!listRes.ok) {
      const t = await listRes.text();
      return { ok: false, error: `Failed to fetch execution list: ${listRes.status} ${t.slice(0, 200)}` };
    }
    const listBody = await listRes.json();
    const items = listBody.data ?? [];
    allExecs.push(...items);
    cursor = listBody.nextCursor ?? null;
    if (!cursor || items.length === 0) break;
  }

  const successful = allExecs.filter((e: any) => e.status === 'success');
  const execs = successful.sort((a: any, b: any) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  console.log(`[backfill] found ${allExecs.length} total, ${execs.length} successful`);

  if (execs.length === 0) {
    return { ok: true, result: { inserted: 0, skipped: 0, errors: 0 }, total: 0, warning: 'No successful executions found.' };
  }

  const snapshots = execs.map((exec: any) => ({
    generated_at: exec.startedAt,
    run_id: String(exec.id),
    status: 'stale',
    latest_health: null,
    totals: null,
    active_pages: [],
    inactive_pages: [],
    receiver_sd_size_bytes: null,
  }));

  const result = insertSnapshots(snapshots);
  return {
    ok: true,
    result,
    total: snapshots.length,
    warning: `Created ${result.inserted} historical run records from execution metadata. Page-level history requires either a receiver history endpoint or forward polling. See BACKFILL.md for details.`,
  };
}

// ─── Source 3: Receiver Status (single snapshot fallback) ──────────────

async function backfillFromReceiverStatus(url: string, secret: string): Promise<BackfillOk | { ok: false; error: string }> {
  const res = await fetchWithTimeout(url, {
    headers: { 'X-Monitor-Secret': secret },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Receiver returned HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  const body = await res.json();
  if (!body.ok) {
    return { ok: false, error: `Receiver returned error: ${body.error ?? 'unknown'}` };
  }

  const result = insertSnapshots([body]);
  return { ok: true, result, total: 1 };
}

// ─── POST handler ───────────────────────────────────────────────────────

export async function POST() {
  const secret = process.env.MONITOR_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'MONITOR_SECRET env var not set' }, { status: 500 });
  }

  const receiverHistoryUrl = process.env.RECEIVER_HISTORY_URL;
  const receiverUrl = process.env.RECEIVER_URL;
  const n8nApiUrl = process.env.N8N_API_URL;
  const n8nApiKey = process.env.N8N_API_KEY;
  const workflowId = process.env.MONITOR_WORKFLOW_ID;

  let result: BackfillOk | { ok: false; error: string };

  // Source 1: explicit receiver history endpoint
  if (receiverHistoryUrl) {
    console.log('[backfill] source: RECEIVER_HISTORY_URL');
    result = await backfillFromReceiverHistory(receiverHistoryUrl, secret);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
  }
  // Source 2: n8n executions API
  else if (n8nApiUrl && n8nApiKey && workflowId) {
    console.log('[backfill] source: N8N_API_URL executions');
    result = await backfillFromN8nExecutions(n8nApiUrl, n8nApiKey, workflowId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
  }
  // Source 3: single snapshot fallback
  else if (receiverUrl) {
    console.log('[backfill] source: RECEIVER_URL (single snapshot fallback)');
    result = await backfillFromReceiverStatus(receiverUrl, secret);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
  }
  else {
    return NextResponse.json({
      ok: false,
      error: 'No backfill source configured. Set RECEIVER_HISTORY_URL, N8N_API_URL+N8N_API_KEY+MONITOR_WORKFLOW_ID, or RECEIVER_URL in .env.local',
    }, { status: 500 });
  }

  setSetting('last_backfill_at', new Date().toISOString());

  return NextResponse.json({
    ok: true,
    inserted: result.result.inserted,
    skipped: result.result.skipped,
    errors: result.result.errors,
    total: result.total,
    warning: result.warning,
    message: `Backfill complete: ${result.result.inserted} new, ${result.result.skipped} duplicates, ${result.result.errors} errors out of ${result.total} snapshots.`,
  });
}
