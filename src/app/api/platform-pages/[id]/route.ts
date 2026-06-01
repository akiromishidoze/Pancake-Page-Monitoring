import { NextResponse } from 'next/server';
import { getPlatformPage, upsertPlatformPage, deletePlatformPage } from '@/lib/db';
import { PlatformPageUpdateSchema } from '@/lib/schemas';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await getPlatformPage(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Platform page not found' }, { status: 404 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = PlatformPageUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;
    const page = await upsertPlatformPage({
      id,
      endpoint_id: body.endpoint_id ?? existing.endpoint_id,
      page_name: body.page_name ?? existing.page_name,
      page_url: body.page_url !== undefined ? body.page_url : existing.page_url,
      is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
    });

    return NextResponse.json({ ok: true, page });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await getPlatformPage(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Platform page not found' }, { status: 404 });
    }

    await deletePlatformPage(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
