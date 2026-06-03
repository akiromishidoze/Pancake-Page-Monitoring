import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { withAuth } from '@/lib/auth';
import { getNotifications, markAsRead, markAllAsRead, dismissNotification, getUnreadCount } from '@/lib/notifications';

export const GET = withAuth(async (req: Request) => {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(limit, offset, unreadOnly),
    getUnreadCount(),
  ]);

  return NextResponse.json({ ok: true, notifications, unreadCount });
});

export const PATCH = withAuth(async (req: Request) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const body = raw as { id?: number; all?: boolean };
  if (body.all) {
    await markAllAsRead();
    return NextResponse.json({ ok: true });
  }

  if (typeof body.id === 'number') {
    await markAsRead(body.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Missing id or all' }, { status: 400 });
});

export const DELETE = withAuth(async (req: Request) => {
  const url = new URL(req.url);
  const idStr = url.searchParams.get('id');
  if (!idStr) {
    return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
  }
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
  }
  await dismissNotification(id);
  return NextResponse.json({ ok: true });
});
