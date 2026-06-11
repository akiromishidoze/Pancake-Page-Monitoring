import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, requireJson } from '@/lib/errors';
import { listPlatformPages, upsertPlatformPage, logAuditEntry } from '@/lib/db';
import { PlatformPageCreateSchema } from '@/lib/schemas';
import { getClientIp } from '@/lib/rate-limit';
import { requireApiAuth } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth) return auth;
  const rl = await rateLimitRoute(req); if (rl) return rl;
  const url = new URL(req.url);
  const endpointId = url.searchParams.get('endpoint_id') || undefined;
  const pages = await listPlatformPages(endpointId);
  return NextResponse.json({ ok: true, pages });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth) return auth;
  const rl = await rateLimitRoute(req); if (rl) return rl;
  const ctErr = requireJson(req);
  if (ctErr) return ctErr;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
  }

  const parsed = PlatformPageCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
  }

  const body = parsed.data;
  const page = await upsertPlatformPage({
    endpoint_id: body.endpoint_id,
    page_name: body.page_name,
    page_url: body.page_url ?? null,
    is_active: body.is_active,
  });

  const ip = getClientIp(req);
  void logAuditEntry('create_platform_page', 'platform_page', page.id, `Created "${body.page_name}" for endpoint ${body.endpoint_id}`, ip);

  return NextResponse.json({ ok: true, page });
}
