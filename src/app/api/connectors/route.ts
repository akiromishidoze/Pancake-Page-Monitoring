import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { listPlatformConnectors, upsertPlatformConnector, deletePlatformConnector, getPlatformConnector } from '@/lib/db';
import { ConnectorCreateSchema } from '@/lib/schemas';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const connectors = await listPlatformConnectors();
    return NextResponse.json({ ok: true, connectors });
  } catch (e) {
    return apiCatch(e);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = ConnectorCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
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
    return apiCatch(e);
  }
}
