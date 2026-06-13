import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { withAuth } from '@/lib/auth';
import { getNotifications, markAsRead, markAllAsRead, dismissNotification, getUnreadCount } from '@/lib/notifications';
import { MarkNotificationsSchema } from '@/lib/schemas';
import { logAuditEntry } from '@/lib/db';
import { getClientIp } from '@/lib/rate-limit';
import { rateLimitRoute } from '@/lib/rate-limit-guard';
import { withCache, invalidateCache } from '@/lib/api-cache';

export const GET = withAuth(withCache(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(limit, offset, unreadOnly),
    getUnreadCount(),
  ]);

  return NextResponse.json({ ok: true, notifications, unreadCount });
}));

export const PATCH = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
  }

  const parsed = MarkNotificationsSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
  }

  const ip = getClientIp(req);
  const body = parsed.data;
  if (body.all) {
    await markAllAsRead();
    invalidateCache('/api/notifications');
    void logAuditEntry('mark_notifications_read', 'notification', 'all', 'Marked all notifications as read', ip);
    return NextResponse.json({ ok: true });
  }

  if (body.id !== undefined) {
    await markAsRead(body.id);
    invalidateCache('/api/notifications');
    void logAuditEntry('mark_notification_read', 'notification', String(body.id), `Marked notification #${body.id} as read`, ip);
    return NextResponse.json({ ok: true });
  }

  return apiError(ErrorCodes.MISSING_FIELD, 'Missing id or all', 400);
});

export const DELETE = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  const url = new URL(req.url);
  const idStr = url.searchParams.get('id');
  if (!idStr) {
    return apiError(ErrorCodes.MISSING_FIELD, 'Missing id', 400);
  }
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return apiError(ErrorCodes.INVALID_VALUE, 'Invalid id', 400);
  }
  await dismissNotification(id);
  invalidateCache('/api/notifications');
  const ip = getClientIp(req);
  void logAuditEntry('dismiss_notification', 'notification', String(id), `Dismissed notification #${id}`, ip);

  return NextResponse.json({ ok: true });
});
