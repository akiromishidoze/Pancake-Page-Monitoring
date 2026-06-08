import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { validateCredentials, hashPassword, withAuth, getSessionUser } from '@/lib/auth';
import { getUserByEmail, updateUserPassword, updateUserEmail, incrementPasswordVersion, clearAllSessions, logAuditEntry } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { ChangePasswordSchema } from '@/lib/schemas';
import { addNotification } from '@/lib/notifications';

export const POST = withAuth(async (req: Request) => {
    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'change-password', max: 3 });
    if (rateLimited) return rateLimited;

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return apiError(ErrorCodes.AUTH_REQUIRED, 'Not authenticated', 401);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = ChangePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const { current_email, current_password, new_email, new_password } = parsed.data;

    const targetEmail = current_email || sessionUser.email;
    const targetUser = await getUserByEmail(targetEmail);
    if (!targetUser) {
      return apiError(ErrorCodes.FORBIDDEN, 'Current credentials are incorrect', 403);
    }

    if (targetUser.id !== sessionUser.id && sessionUser.role !== 'admin') {
      return apiError(ErrorCodes.FORBIDDEN, 'Cannot change another user\'s credentials', 403);
    }

    if (!(await validateCredentials(targetEmail, current_password))) {
      return apiError(ErrorCodes.FORBIDDEN, 'Current credentials are incorrect', 403);
    }

    const changes: string[] = [];

    if (new_password) {
      const hashed = await hashPassword(new_password);
      await updateUserPassword(targetUser.id, hashed);
      await incrementPasswordVersion();
      await clearAllSessions();
      changes.push('password');
    }

    if (new_email && new_email !== targetUser.email) {
      await updateUserEmail(targetUser.id, new_email);
      changes.push('email');
    }

    if (changes.length > 0) {
      void logAuditEntry('update_credentials', 'user', String(targetUser.id), `Changed: ${changes.join(', ')}`, ip);
      void addNotification('credential_change', 'warning', 'Credentials Changed', `User "${targetUser.email}" credentials updated: ${changes.join(', ')}`);
    }

    return NextResponse.json({ ok: true, message: 'Credentials updated' });
});
