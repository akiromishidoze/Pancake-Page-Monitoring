import { NextResponse } from 'next/server';
import { apiError, apiCatch } from '@/lib/errors';
import { pool } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const action = url.searchParams.get('action') || null;
    const entityType = url.searchParams.get('entity_type') || null;

    let where = '';
    const params: unknown[] = [];
    let idx = 0;
    if (action) {
      idx++;
      where += `${idx > 1 ? ' AND' : 'WHERE'} action = $${idx}`;
      params.push(action);
    }
    if (entityType) {
      idx++;
      where += `${idx > 1 ? ' AND' : 'WHERE'} entity_type = $${idx}`;
      params.push(entityType);
    }

    idx++;
    const rows = await pool.query(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );
    idx++;
    const total = await pool.query(
      `SELECT COUNT(*) as c FROM audit_log ${where}`,
      params,
    );

    return NextResponse.json({
      ok: true,
      entries: rows.rows,
      total: parseInt(total.rows[0].c, 10),
      limit,
      offset,
    });
  } catch (e) {
    return apiCatch(e);
  }
}
