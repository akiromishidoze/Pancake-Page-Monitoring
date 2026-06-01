import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { listPlatformPages, upsertPlatformPage } from '@/lib/db';
import { PlatformPageCreateSchema } from '@/lib/schemas';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const endpointId = url.searchParams.get('endpoint_id') || undefined;
  const pages = await listPlatformPages(endpointId);
  return NextResponse.json({ ok: true, pages });
}

export async function POST(req: Request) {
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

  return NextResponse.json({ ok: true, page });
}
