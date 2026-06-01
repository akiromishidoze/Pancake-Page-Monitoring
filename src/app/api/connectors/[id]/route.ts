import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getPlatformConnector, deletePlatformConnector } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
