import { NextResponse } from 'next/server';
import { listPlatformConnectors, upsertPlatformConnector, deletePlatformConnector, getPlatformConnector } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
  const connectors = await listPlatformConnectors();
  return NextResponse.json({ ok: true, connectors });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.name || !body.platform_type || !body.api_url) {
    return NextResponse.json({ ok: false, error: 'name, platform_type, and api_url are required' }, { status: 400 });
  }

  const connector = await upsertPlatformConnector({
    id: (body.id as string) || undefined,
    name: body.name as string,
    platform_type: body.platform_type as string,
    api_url: body.api_url as string,
    auth_header: (body.auth_header as string) || null,
    auth_token: (body.auth_token as string) || null,
    json_path: (body.json_path as string) || null,
    interval_ms: (body.interval_ms as number) || 60000,
    is_active: (body.is_active as number) ?? 1,
  });

  return NextResponse.json({ ok: true, connector });
}
