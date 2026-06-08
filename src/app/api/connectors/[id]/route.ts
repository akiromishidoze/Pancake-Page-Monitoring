import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { getPlatformConnector, deletePlatformConnector, logAuditEntry } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const existing = await getPlatformConnector(id);
    if (!existing) {
      return apiError(ErrorCodes.NOT_FOUND, 'Connector not found', 404);
    }
    const name = existing.name;
    await deletePlatformConnector(id);
    const ip = getClientIp(req);
    void logAuditEntry('delete_connector', 'connector', id, `Deleted "${name}"`, ip);
    return NextResponse.json({ ok: true });
});
