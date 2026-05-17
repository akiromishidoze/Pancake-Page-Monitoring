import { NextResponse } from 'next/server';
import { getPlatformConnector, deletePlatformConnector } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getPlatformConnector(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Connector not found' }, { status: 404 });
  }
  await deletePlatformConnector(id);
  return NextResponse.json({ ok: true });
}
