import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { getPlatformPage, upsertPlatformPage, deletePlatformPage, logAuditEntry } from '@/lib/db';
import { PlatformPageUpdateSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const PUT = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    const { id } = await params;
    const existing = await getPlatformPage(id);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'Platform page not found', 404);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = PlatformPageUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const body = parsed.data;
    const page = await upsertPlatformPage({
      id,
      endpoint_id: body.endpoint_id ?? existing.endpoint_id,
      page_name: body.page_name ?? existing.page_name,
      page_url: body.page_url !== undefined ? body.page_url : existing.page_url,
      is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
    });

    const changed: string[] = [];
    if (body.endpoint_id !== undefined && body.endpoint_id !== existing.endpoint_id) changed.push('endpoint_id');
    if (body.page_name !== undefined && body.page_name !== existing.page_name) changed.push('page_name');
    if (body.page_url !== undefined && body.page_url !== existing.page_url) changed.push('page_url');
    if (body.is_active !== undefined && body.is_active !== existing.is_active) changed.push('is_active');
    if (changed.length > 0) {
      const ip = getClientIp(req);
      void logAuditEntry('update_platform_page', 'platform_page', id, `Changed: ${changed.join(', ')}`, ip);
    }

    return NextResponse.json({ ok: true, page });
});

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    const { id } = await params;
    const existing = await getPlatformPage(id);
    if (!existing) {
    return apiError(ErrorCodes.NOT_FOUND, 'Platform page not found', 404);
  }

  const name = existing.page_name;
  await deletePlatformPage(id);
    const ip = getClientIp(req);
    void logAuditEntry('delete_platform_page', 'platform_page', id, `Deleted "${name}"`, ip);

    return NextResponse.json({ ok: true });
});
