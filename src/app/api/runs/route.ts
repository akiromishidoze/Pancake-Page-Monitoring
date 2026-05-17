import { NextResponse } from 'next/server';
import { pool, type RunRow } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const url = new URL(req.url);
  const endpointId = url.searchParams.get('endpoint_id') || null;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

  let rows: RunRow[];
  let total: number;

  if (endpointId) {
    const r = await pool.query('SELECT * FROM runs WHERE endpoint_id = $1 ORDER BY generated_at DESC LIMIT $2 OFFSET $3', [endpointId, limit, offset]);
    rows = r.rows;
    const c = await pool.query('SELECT COUNT(*) as c FROM runs WHERE endpoint_id = $1', [endpointId]);
    total = parseInt(c.rows[0].c, 10);
  } else {
    const r = await pool.query('SELECT * FROM runs ORDER BY generated_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    rows = r.rows;
    const c = await pool.query('SELECT COUNT(*) as c FROM runs');
    total = parseInt(c.rows[0].c, 10);
  }

  return NextResponse.json({
    ok: true,
    runs: rows,
    total,
    limit,
    offset,
  });
}
