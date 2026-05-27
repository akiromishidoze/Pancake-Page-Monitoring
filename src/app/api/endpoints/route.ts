// GET /api/endpoints — list all configured endpoints
// POST /api/endpoints — create or update an endpoint

import { NextResponse } from 'next/server';
import { listEndpoints, upsertEndpoint } from '@/lib/db';

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
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body.name || !body.api_key) {
      return NextResponse.json({ ok: false, error: 'name and api_key are required' }, { status: 400 });
    }

    const endpoint = await upsertEndpoint({
      id: (body.id as string) || undefined,
      name: body.name as string,
      api_key: body.api_key as string,
      url: (body.url as string) || null,
      access_token: (body.access_token as string) || null,
      token_expires_at: (body.token_expires_at as string) || null,
      is_active: (body.is_active as boolean) ?? true,
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
