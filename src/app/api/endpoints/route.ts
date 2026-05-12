// GET /api/endpoints — list all configured endpoints
// POST /api/endpoints — create or update an endpoint

import { NextResponse } from 'next/server';
import { listEndpoints, upsertEndpoint } from '@/lib/db';

export async function GET() {
  const endpoints = listEndpoints();
  const safe = endpoints.map((e) => ({
    ...e,
    api_key: e.api_key ? `${e.api_key.slice(0, 8)}...${e.api_key.slice(-4)}` : null,
  }));
  return NextResponse.json({ ok: true, endpoints: safe });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.name || !body.api_key) {
    return NextResponse.json({ ok: false, error: 'name and api_key are required' }, { status: 400 });
  }

  const endpoint = upsertEndpoint({
    id: body.id || undefined,
    name: body.name,
    url: body.url || null,
    api_key: body.api_key,
    token_expires_at: body.token_expires_at || null,
    is_active: body.is_active ?? 1,
  });

  return NextResponse.json({
    ok: true,
    endpoint: { ...endpoint, api_key: undefined },
  });
}
