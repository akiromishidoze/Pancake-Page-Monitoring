import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'csv';
  const endpointId = url.searchParams.get('endpoint_id') || null;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10000', 10), 100000);

  const db = getDb();

  if (format === 'json') {
    let runs: any[];
    if (endpointId) {
      runs = db.prepare('SELECT * FROM runs WHERE endpoint_id = ? ORDER BY generated_at DESC LIMIT ?').all(endpointId, limit);
    } else {
      runs = db.prepare('SELECT * FROM runs ORDER BY generated_at DESC LIMIT ?').all(limit);
    }
    return NextResponse.json({ ok: true, runs });
  }

  // CSV format
  let rows: any[];
  if (endpointId) {
    rows = db.prepare(`
      SELECT r.run_id, r.endpoint_id, r.generated_at, r.received_at, r.heartbeat_ok,
             r.run_quality, r.severity, r.canary_status, r.canary_alert,
             r.outage_suspected, r.alert_count, r.total_pages, r.active_pages, r.inactive_pages
      FROM runs r
      WHERE r.endpoint_id = ?
      ORDER BY r.generated_at DESC LIMIT ?
    `).all(endpointId, limit) as any[];
  } else {
    rows = db.prepare(`
      SELECT r.run_id, r.endpoint_id, r.generated_at, r.received_at, r.heartbeat_ok,
             r.run_quality, r.severity, r.canary_status, r.canary_alert,
             r.outage_suspected, r.alert_count, r.total_pages, r.active_pages, r.inactive_pages
      FROM runs r
      ORDER BY r.generated_at DESC LIMIT ?
    `).all(limit) as any[];
  }

  const headers = ['run_id', 'endpoint_id', 'generated_at', 'received_at', 'heartbeat_ok', 'run_quality', 'severity', 'canary_status', 'canary_alert', 'outage_suspected', 'alert_count', 'total_pages', 'active_pages', 'inactive_pages'];

  const csvRows = rows.map((r: any) =>
    headers.map((h) => {
      const val = r[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  );

  const csv = headers.join(',') + '\n' + csvRows.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="page-monitor-runs-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
