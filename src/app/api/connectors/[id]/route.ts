import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getPlatformConnector, deletePlatformConnector } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const { id } = await params;
    const existing = await getPlatformConnector(id);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'Connector not found', 404);
    }
    await deletePlatformConnector(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiCatch(e);
  }
}
