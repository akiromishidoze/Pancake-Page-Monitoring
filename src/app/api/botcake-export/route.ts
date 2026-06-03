import { NextResponse } from 'next/server';
import { escapeCsvCell } from '@/lib/format';
import { apiCatch } from '@/lib/errors';
import { getLatestPageStates, getBotCakeOverrides, listEndpoints, isBotCakeEndpoint } from '@/lib/db';
import { cors, corsOptions } from '@/lib/cors';
import { requireApiAuth } from '@/lib/auth';

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return cors(auth);
    const { searchParams } = new URL(request.url);
    const endpointId = searchParams.get('endpoint_id');

    const allEndpoints = await listEndpoints();
    const botcakeEndpoints = allEndpoints.filter(isBotCakeEndpoint);
    const targetIds = endpointId
      ? [endpointId]
      : botcakeEndpoints.map(e => e.id);

    const pageResults = await Promise.all(targetIds.map(id => getLatestPageStates(id)));
    const pages = pageResults.flat();
    const overrides = await getBotCakeOverrides();

  const header = 'page_id,page_name,status,activation_reason,customer_count,hours_since_last_activity,overridden';
  const rows = pages.map(p => {
    const hours = p.hours_since_last_customer_activity;
    const lastActivity = hours !== null ? hours.toFixed(1) : '';
    const status = p.is_activated ? 'active' : 'inactive';
    const overridden = overrides.has(p.page_id) ? 'yes' : 'no';
    return [
      p.page_id,
      escapeCsvCell(p.page_name ?? ''),
      status,
      p.activation_reason ?? '',
      p.customer_count ?? '',
      lastActivity,
      overridden,
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');

  return cors(new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="botcake-pages-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  }));
  } catch (e) {
    return cors(apiCatch(e));
  }
}
