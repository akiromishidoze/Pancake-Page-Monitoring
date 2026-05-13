import { NextResponse } from 'next/server';
import { getDb, type RunRow } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const url = new URL(req.url);
  const endpointId = url.searchParams.get('endpoint_id') || null;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

  const db = getDb();
  let rows: RunRow[];
  let total: number;

  if (endpointId) {
    rows = db.prepare('SELECT * FROM runs WHERE endpoint_id = ? ORDER BY generated_at DESC LIMIT ? OFFSET ?').all(endpointId, limit, offset) as RunRow[];
    total = (db.prepare('SELECT COUNT(*) as c FROM runs WHERE endpoint_id = ?').get(endpointId) as { c: number }).c;
  } else {
    rows = db.prepare('SELECT * FROM runs ORDER BY generated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as RunRow[];
    total = (db.prepare('SELECT COUNT(*) as c FROM runs').get() as { c: number }).c;
  }

  return NextResponse.json({
    ok: true,
    runs: rows,
    total,
    limit,
    offset,
  });
}
