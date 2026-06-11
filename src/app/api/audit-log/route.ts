import { NextResponse } from 'next/server';
import { apiError, apiCatch } from '@/lib/errors';
import { queryRows } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const GET = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const action = url.searchParams.get('action') || null;
    const entityType = url.searchParams.get('entity_type') || null;
    const dateFrom = url.searchParams.get('date_from') || null;
    const dateTo = url.searchParams.get('date_to') || null;

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (action) {
      params.push(action);
      clauses.push(`action = $${params.length}`);
    }
    if (entityType) {
      params.push(entityType);
      clauses.push(`entity_type = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      clauses.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      params.push(dateTo);
      clauses.push(`created_at <= $${params.length}::timestamptz`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    params.push(limit, offset);
    const entries = await queryRows<Record<string, unknown>>(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = params.slice(0, -2);
    const countRow = await queryRows<{ c: string }>(
      `SELECT COUNT(*) as c FROM audit_log ${where}`,
      countParams,
    );

    const distinctActions = await queryRows<{ action: string }>(
      `SELECT DISTINCT action FROM audit_log ORDER BY action`,
    );
    const distinctEntityTypes = await queryRows<{ entity_type: string | null }>(
      `SELECT DISTINCT entity_type FROM audit_log WHERE entity_type IS NOT NULL ORDER BY entity_type`,
    );

    return NextResponse.json({
      ok: true,
      entries,
      total: parseInt(countRow[0]?.c ?? '0', 10),
      actions: distinctActions.map(r => r.action),
      entity_types: distinctEntityTypes.map(r => r.entity_type),
      limit,
      offset,
    });
});
