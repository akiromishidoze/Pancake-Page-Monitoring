import { NextResponse } from 'next/server';
import { listPlatformPages, upsertPlatformPage } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const url = new URL(req.url);
  const endpointId = url.searchParams.get('endpoint_id') || undefined;
  const pages = await listPlatformPages(endpointId);
  return NextResponse.json({ ok: true, pages });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.endpoint_id || !body.page_name) {
    return NextResponse.json({ ok: false, error: 'endpoint_id and page_name are required' }, { status: 400 });
  }

  const page = await upsertPlatformPage({
    endpoint_id: body.endpoint_id as string,
    page_name: body.page_name as string,
    page_url: (body.page_url as string) || null,
    is_active: (body.is_active as number) ?? 1,
  });

  return NextResponse.json({ ok: true, page });
}
