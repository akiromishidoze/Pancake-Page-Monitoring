import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { withAuth } from '@/lib/auth';
import { queryRow } from '@/lib/db';
import type { NotificationRow } from '@/lib/notifications';

export const GET = withAuth(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
    }

    const notification = await queryRow<NotificationRow>('SELECT * FROM notifications WHERE id = $1', [id]);
    if (!notification) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, notification });
});
