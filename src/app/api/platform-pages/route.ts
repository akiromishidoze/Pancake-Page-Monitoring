import { NextResponse } from 'next/server';
import { listPlatformPages, upsertPlatformPage } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const url = new URL(req.url);
  const endpointId = url.searchParams.get('endpoint_id') || undefined;
  const pages = listPlatformPages(endpointId);
  return NextResponse.json({ ok: true, pages });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.endpoint_id || !body.page_name) {
    return NextResponse.json({ ok: false, error: 'endpoint_id and page_name are required' }, { status: 400 });
  }

  const page = upsertPlatformPage({
    endpoint_id: body.endpoint_id,
    page_name: body.page_name,
    page_url: body.page_url || null,
    is_active: body.is_active ?? 1,
  });

  return NextResponse.json({ ok: true, page });
}
