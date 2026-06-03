// PUT /api/endpoints/:id — update an endpoint
// DELETE /api/endpoints/:id — delete an endpoint

import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getEndpoint, upsertEndpoint, deleteEndpoint } from '@/lib/db';
import { EndpointUpdateSchema } from '@/lib/schemas';
import { requireApiAuth } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const { id } = await params;
    const existing = await getEndpoint(id);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'Endpoint not found', 404);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = EndpointUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const body = parsed.data;
    const newToken = body.access_token !== undefined ? body.access_token : existing.access_token;
    const tokenChanged = body.access_token !== undefined && body.access_token !== existing.access_token;
    const endpoint = await upsertEndpoint({
      id,
      name: body.name ?? existing.name,
      url: body.url !== undefined ? body.url : existing.url,
      api_key: body.api_key ?? existing.api_key,
      access_token: newToken,
      token_expires_at:
        body.token_expires_at !== undefined
          ? body.token_expires_at
          : tokenChanged && newToken
            ? new Date(Date.now() + 60 * 86400000).toISOString()
            : existing.token_expires_at,
      is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
    });

    return NextResponse.json({ ok: true, endpoint: { ...endpoint, api_key: undefined } });
  } catch (e) {
    return apiCatch(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const { id } = await params;
    const existing = await getEndpoint(id);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'Endpoint not found', 404);
    }

    await deleteEndpoint(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiCatch(e);
  }
}
