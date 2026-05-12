import { NextResponse } from 'next/server';
import { listPlatformConnectors, upsertPlatformConnector, deletePlatformConnector, getPlatformConnector } from '@/lib/db';

export async function GET() {
  const connectors = listPlatformConnectors();
  return NextResponse.json({ ok: true, connectors });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.name || !body.platform_type || !body.api_url) {
    return NextResponse.json({ ok: false, error: 'name, platform_type, and api_url are required' }, { status: 400 });
  }

  const connector = upsertPlatformConnector({
    id: body.id || undefined,
    name: body.name,
    platform_type: body.platform_type,
    api_url: body.api_url,
    auth_header: body.auth_header || null,
    auth_token: body.auth_token || null,
    json_path: body.json_path || null,
    interval_ms: body.interval_ms || 60000,
    is_active: body.is_active ?? 1,
  });

  return NextResponse.json({ ok: true, connector });
}
