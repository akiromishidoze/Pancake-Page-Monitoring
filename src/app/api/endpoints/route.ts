// GET /api/endpoints — list all configured endpoints
// POST /api/endpoints — create or update an endpoint

import { NextResponse } from 'next/server';
import { listEndpoints, upsertEndpoint } from '@/lib/db';
import { EndpointCreateSchema } from '@/lib/schemas';

export async function GET() {
  try {
    const endpoints = await listEndpoints();
    const safe = endpoints.map((e) => ({
      ...e,
      api_key: e.api_key ? `${e.api_key.slice(0, 8)}...${e.api_key.slice(-4)}` : null,
    }));
    return NextResponse.json({ ok: true, endpoints: safe });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = EndpointCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;
    const endpoint = await upsertEndpoint({
      id: body.id,
      name: body.name,
      api_key: body.api_key,
      url: body.url ?? null,
      access_token: body.access_token ?? null,
      token_expires_at: body.token_expires_at ?? null,
      is_active: body.is_active,
    });

    return NextResponse.json({
      ok: true,
      endpoint: { ...endpoint, api_key: undefined },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
