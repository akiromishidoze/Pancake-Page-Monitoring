// PUT /api/endpoints/:id — update an endpoint
// DELETE /api/endpoints/:id — delete an endpoint

import { NextResponse } from 'next/server';
import { getEndpoint, upsertEndpoint, deleteEndpoint } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const { id } = await params;
  const existing = getEndpoint(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Endpoint not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const endpoint = upsertEndpoint({
    id,
    name: (body.name as string) ?? existing.name,
    url: body.url !== undefined ? (body.url as string) : existing.url,
    api_key: (body.api_key as string) ?? existing.api_key,
    access_token: body.access_token !== undefined ? (body.access_token as string) : existing.access_token,
    token_expires_at: body.token_expires_at !== undefined ? (body.token_expires_at as string) : existing.token_expires_at,
    is_active: body.is_active !== undefined ? (body.is_active as number) : existing.is_active,
  });

  return NextResponse.json({ ok: true, endpoint: { ...endpoint, api_key: undefined } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(); if (auth) return auth;
  const { id } = await params;
  const existing = getEndpoint(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Endpoint not found' }, { status: 404 });
  }

  deleteEndpoint(id);
  return NextResponse.json({ ok: true });
}
