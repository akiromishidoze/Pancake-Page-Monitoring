import { NextResponse } from 'next/server';
import { getPlatformPage, upsertPlatformPage, deletePlatformPage } from '@/lib/db';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = getPlatformPage(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Platform page not found' }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const page = upsertPlatformPage({
    id,
    endpoint_id: body.endpoint_id ?? existing.endpoint_id,
    page_name: body.page_name ?? existing.page_name,
    page_url: body.page_url !== undefined ? body.page_url : existing.page_url,
    is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
  });

  return NextResponse.json({ ok: true, page });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = getPlatformPage(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Platform page not found' }, { status: 404 });
  }

  deletePlatformPage(id);
  return NextResponse.json({ ok: true });
}
