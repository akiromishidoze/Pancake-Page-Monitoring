import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { withAuth } from '@/lib/auth';
import { queryRow } from '@/lib/db';
import type { NotificationRow } from '@/lib/notifications';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const GET = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return apiError(ErrorCodes.INVALID_VALUE, 'Invalid id', 400);
    }

    const notification = await queryRow<NotificationRow>('SELECT * FROM notifications WHERE id = $1', [id]);
    if (!notification) {
      return apiError(ErrorCodes.NOT_FOUND, 'Not found', 404);
    }

    return NextResponse.json({ ok: true, notification });
});
