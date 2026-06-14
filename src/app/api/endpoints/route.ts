// GET /api/endpoints — list all configured endpoints
// POST /api/endpoints — create or update an endpoint

import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { listEndpoints, upsertEndpoint, logAuditEntry } from '@/lib/db';
import { EndpointCreateSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';
import { addNotification } from '@/lib/notifications';
import { getClientIp } from '@/lib/rate-limit';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const GET = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  const endpoints = await listEndpoints();
  const safe = endpoints.map(({ api_key_hash: _hash, ...rest }) => ({
    ...rest,
    api_key: rest.api_key ? `${rest.api_key.slice(0, 8)}...${rest.api_key.slice(-4)}` : null,
  }));
  return NextResponse.json({ ok: true, endpoints: safe });
});

export const POST = withAuth(async (req: Request) => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = EndpointCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const body = parsed.data;
    const endpoint = await upsertEndpoint({
      id: body.id,
      name: body.name,
      api_key: body.api_key,
      url: body.url ?? null,
      access_token: body.access_token ?? null,
      token_expires_at:
        body.token_expires_at !== undefined
          ? body.token_expires_at
          : body.access_token
            ? new Date(Date.now() + 60 * 86400000).toISOString()
            : null,
      fb_page_id: body.fb_page_id ?? null,
      is_active: body.is_active,
    });

    const ip = getClientIp(req);
    void logAuditEntry('create_endpoint', 'endpoint', endpoint.id, `Created "${body.name}"`, ip);
    void addNotification('platform_added', 'info', 'Endpoint Updated', `Endpoint "${body.name}" (${body.id}) configured`);

    return NextResponse.json({
      ok: true,
      endpoint: { ...endpoint, api_key: undefined, api_key_hash: undefined },
    });
});
