import { NextResponse } from 'next/server';
import { listPlatformConnectors, upsertPlatformConnector, deletePlatformConnector, getPlatformConnector } from '@/lib/db';
import { ConnectorCreateSchema } from '@/lib/schemas';

export async function GET() {
  try {
    const connectors = await listPlatformConnectors();
    return NextResponse.json({ ok: true, connectors });
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

    const parsed = ConnectorCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;
    const connector = await upsertPlatformConnector({
      id: body.id,
      name: body.name,
      platform_type: body.platform_type,
      api_url: body.api_url,
      auth_header: body.auth_header ?? null,
      auth_token: body.auth_token ?? null,
      json_path: body.json_path ?? null,
      interval_ms: body.interval_ms,
      is_active: body.is_active,
    });

    return NextResponse.json({ ok: true, connector });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
