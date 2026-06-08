import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { validateCredentials, hashPassword, withAuth } from '@/lib/auth';
import { setSetting, logAuditEntry } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { ChangePasswordSchema } from '@/lib/schemas';
import { addNotification } from '@/lib/notifications';

export const POST = withAuth(async (req: Request) => {
    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'change-password', max: 3 });
    if (rateLimited) return rateLimited;

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

    // Validate current credentials using bcrypt-aware comparison
    if (!(await validateCredentials(current_email, current_password))) {
      return apiError(ErrorCodes.FORBIDDEN, 'Current credentials are incorrect', 403);
    }

    if (new_email) {
      await setSetting('auth_email', new_email);
    }

    const changes: string[] = [];

    if (new_password) {
      // Hash before storing — never save plain text
      const hashed = await hashPassword(new_password);
      await setSetting('auth_password', hashed);
      changes.push('password');
    }

    if (new_email) {
      changes.push('email');
    }

    if (changes.length > 0) {
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
      void logAuditEntry('update_credentials', 'auth', 'credentials', `Changed: ${changes.join(', ')}`, ip);
      void addNotification('credential_change', 'warning', 'Credentials Changed', `Authentication credentials updated: ${changes.join(', ')}`);
    }

    return NextResponse.json({ ok: true, message: 'Credentials updated' });
});
