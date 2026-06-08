import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { listPlatformConnectors, upsertPlatformConnector, logAuditEntry } from '@/lib/db';
import { ConnectorCreateSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';
import { addNotification } from '@/lib/notifications';
import { getClientIp } from '@/lib/rate-limit';

export const GET = withAuth(async () => {
  const connectors = await listPlatformConnectors();
  return NextResponse.json({ ok: true, connectors });
});

export const POST = withAuth(async (req: Request) => {
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

    const ip = getClientIp(req);
    void logAuditEntry('create_connector', 'connector', connector.id, `Created "${body.name}" (${body.platform_type})`, ip);
    void addNotification('connector_added', 'info', 'Connector Added', `Connector "${body.name}" (${body.platform_type}) configured`);

    return NextResponse.json({ ok: true, connector });
});
