import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getPlatformPage, upsertPlatformPage, deletePlatformPage } from '@/lib/db';
import { PlatformPageUpdateSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';

export const PUT = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
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

    return NextResponse.json({ ok: true, page });
});

export const DELETE = withAuth(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const existing = await getPlatformPage(id);
    if (!existing) {
    return apiError(ErrorCodes.NOT_FOUND, 'Platform page not found', 404);
  }

  await deletePlatformPage(id);
    return NextResponse.json({ ok: true });
});
