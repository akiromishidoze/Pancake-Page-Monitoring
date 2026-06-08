// PUT /api/endpoints/:id — update an endpoint
// DELETE /api/endpoints/:id — delete an endpoint

import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { getEndpoint, upsertEndpoint, deleteEndpoint, logAuditEntry } from '@/lib/db';
import { EndpointUpdateSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';

export const PUT = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
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
      fb_page_id: body.fb_page_id !== undefined ? body.fb_page_id : existing.fb_page_id,
      is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
    });

    const changed: string[] = [];
    if (body.name !== undefined && body.name !== existing.name) changed.push('name');
    if (body.api_key !== undefined && body.api_key !== existing.api_key) changed.push('api_key');
    if (body.url !== undefined && body.url !== existing.url) changed.push('url');
    if (body.access_token !== undefined && body.access_token !== existing.access_token) changed.push('access_token');
    if (body.token_expires_at !== undefined && body.token_expires_at !== existing.token_expires_at) changed.push('token_expires_at');
    if (body.fb_page_id !== undefined && body.fb_page_id !== existing.fb_page_id) changed.push('fb_page_id');
    if (body.shop_label !== undefined && body.shop_label !== existing.shop_label) changed.push('shop_label');
    if (body.is_active !== undefined && body.is_active !== existing.is_active) changed.push('is_active');
    if (changed.length > 0) {
      const ip = getClientIp(req);
      void logAuditEntry('update_endpoint', 'endpoint', id, `Changed: ${changed.join(', ')}`, ip);
    }

    return NextResponse.json({ ok: true, endpoint: { ...endpoint, api_key: undefined } });
});

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const existing = await getEndpoint(id);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'Endpoint not found', 404);
    }

    const name = existing.name;
    await deleteEndpoint(id);
    const ip = getClientIp(req);
    void logAuditEntry('delete_endpoint', 'endpoint', id, `Deleted "${name}"`, ip);

    return NextResponse.json({ ok: true });
});
