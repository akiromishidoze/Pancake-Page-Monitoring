import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const { pageId } = await params;
  const url = new URL(req.url);
  const shop = url.searchParams.get('shop');

  const headers = ['run_id', 'page_id', 'shop_label', 'page_name', 'activity_kind', 'is_activated', 'is_canary', 'activation_reason', 'state_change', 'activity_kind_change', 'hours_since_last_order', 'hours_since_last_customer_activity', 'response_ms', 'fetch_errors', 'customer_count', 'generated_at'];

  let rows: Array<Record<string, unknown>>;
  if (shop) {
    const r = await pool.query('SELECT * FROM page_states WHERE page_id = $1 AND shop_label = $2 ORDER BY generated_at ASC', [pageId, shop]);
    rows = r.rows;
  } else {
    const r = await pool.query('SELECT * FROM page_states WHERE page_id = $1 ORDER BY generated_at ASC', [pageId]);
    rows = r.rows;
  }

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
      'Content-Disposition': `attachment; filename="page-${encodeURIComponent(pageId)}-history.csv"`,
    },
  });
}
