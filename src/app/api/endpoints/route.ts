// GET /api/endpoints — list all configured endpoints
// POST /api/endpoints — create or update an endpoint

import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { listEndpoints, upsertEndpoint } from '@/lib/db';
import { EndpointCreateSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async () => {
  const endpoints = await listEndpoints();
  const safe = endpoints.map((e) => ({
    ...e,
    api_key: e.api_key ? `${e.api_key.slice(0, 8)}...${e.api_key.slice(-4)}` : null,
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
      is_active: body.is_active,
    });

    return NextResponse.json({
      ok: true,
      endpoint: { ...endpoint, api_key: undefined },
    });
});
