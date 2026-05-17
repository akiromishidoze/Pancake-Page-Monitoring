import { NextResponse } from 'next/server';
import { getLatestPageStates, getBotCakeOverrides } from '@/lib/db';

export async function GET() {
  const pages = getLatestPageStates('botcake-platform');
  const overrides = getBotCakeOverrides();

  const header = 'page_id,page_name,status,activation_reason,customer_count,hours_since_last_activity,overridden';
  const rows = pages.map(p => {
    const hours = p.hours_since_last_customer_activity;
    const lastActivity = hours !== null ? hours.toFixed(1) : '';
    const status = p.is_activated === 1 ? 'active' : 'inactive';
    const overridden = overrides.has(p.page_id) ? 'yes' : 'no';
    return [
      p.page_id,
      `"${(p.page_name ?? '').replace(/"/g, '""')}"`,
      status,
      p.activation_reason ?? '',
      p.customer_count ?? '',
      lastActivity,
      overridden,
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="botcake-pages-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
