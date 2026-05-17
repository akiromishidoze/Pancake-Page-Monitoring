import { NextResponse } from 'next/server';
import { pool, type RunRow } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'csv';
  const endpointId = url.searchParams.get('endpoint_id') || null;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10000', 10), 100000);

  if (format === 'json') {
    let runs: RunRow[];
    if (endpointId) {
      const r = await pool.query('SELECT * FROM runs WHERE endpoint_id = $1 ORDER BY generated_at DESC LIMIT $2', [endpointId, limit]);
      runs = r.rows;
    } else {
      const r = await pool.query('SELECT * FROM runs ORDER BY generated_at DESC LIMIT $1', [limit]);
      runs = r.rows;
    }
    return NextResponse.json({ ok: true, runs });
  }

  // CSV format
  let rows: Array<Record<string, unknown>>;
  if (endpointId) {
    const r = await pool.query(`
      SELECT r.run_id, r.endpoint_id, r.generated_at, r.received_at, r.heartbeat_ok,
             r.run_quality, r.severity, r.canary_status, r.canary_alert,
             r.outage_suspected, r.alert_count, r.total_pages, r.active_pages, r.inactive_pages
      FROM runs r
      WHERE r.endpoint_id = $1
      ORDER BY r.generated_at DESC LIMIT $2
    `, [endpointId, limit]);
    rows = r.rows;
  } else {
    const r = await pool.query(`
      SELECT r.run_id, r.endpoint_id, r.generated_at, r.received_at, r.heartbeat_ok,
             r.run_quality, r.severity, r.canary_status, r.canary_alert,
             r.outage_suspected, r.alert_count, r.total_pages, r.active_pages, r.inactive_pages
      FROM runs r
      ORDER BY r.generated_at DESC LIMIT $1
    `, [limit]);
    rows = r.rows;
  }

  const headers = ['run_id', 'endpoint_id', 'generated_at', 'received_at', 'heartbeat_ok', 'run_quality', 'severity', 'canary_status', 'canary_alert', 'outage_suspected', 'alert_count', 'total_pages', 'active_pages', 'inactive_pages'];

  const csvRows = rows.map((r) =>
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
