// PUT /api/endpoints/:id — update an endpoint
// DELETE /api/endpoints/:id — delete an endpoint

import { NextResponse } from 'next/server';
import { getEndpoint, upsertEndpoint, deleteEndpoint } from '@/lib/db';
import { EndpointUpdateSchema } from '@/lib/schemas';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getEndpoint(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Endpoint not found' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = EndpointUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const endpoint = await upsertEndpoint({
    id,
    name: body.name ?? existing.name,
    url: body.url !== undefined ? body.url : existing.url,
    api_key: body.api_key ?? existing.api_key,
    access_token: body.access_token !== undefined ? body.access_token : existing.access_token,
    token_expires_at: body.token_expires_at !== undefined ? body.token_expires_at : existing.token_expires_at,
    is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
  });

  return NextResponse.json({ ok: true, endpoint: { ...endpoint, api_key: undefined } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getEndpoint(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Endpoint not found' }, { status: 404 });
  }

  await deleteEndpoint(id);
  return NextResponse.json({ ok: true });
}
