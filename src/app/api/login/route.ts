import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { cookies } from 'next/headers';
import { validateCredentials, createSession, isDefaultPassword } from '@/lib/auth';
import { getSetting } from '@/lib/db';
import { createTotpTempToken } from '@/lib/totp';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { LoginSchema } from '@/lib/schemas';
import { recordFailedAttempt, resetAttempts, getLockoutStatus, MAX_ATTEMPTS } from '@/lib/lockout';
import { addNotification } from '@/lib/notifications';
import { logAuditEntry } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'login', max: 5 });
    if (rateLimited) return rateLimited;

    const ctErr = requireJson(req);
    if (ctErr) return ctErr;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = LoginSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const { email, username, password } = parsed.data;
    const identifier = email || username || 'admin';

    const lockout = await getLockoutStatus(identifier);
    if (lockout.locked) {
      return apiError(ErrorCodes.AUTH_ACCOUNT_LOCKED, `Account locked. Try again in ${Math.ceil(lockout.remainingMs / 60000)} minutes.`, 429);
    }

    if (!(await validateCredentials(identifier, password))) {
      const result = await recordFailedAttempt(identifier, ip);
      if (result.locked) {
        void addNotification('external_error', 'critical', 'Account Locked', `Account "${identifier}" locked due to ${MAX_ATTEMPTS} failed login attempts from ${ip}. Unlocks in ${Math.ceil(result.remainingMs / 60000)} minutes.`);
        void logAuditEntry('account_locked', 'auth', identifier, `Locked after ${MAX_ATTEMPTS} failed attempts from ${ip}`, ip);
      }
      return apiError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }

    await resetAttempts(identifier);
    void logAuditEntry('login', 'auth', identifier, `Successful login from ${ip}`, ip);

    const totpEnabled = await getSetting('totp_enabled');
    if (totpEnabled === 'true') {
      const totpToken = createTotpTempToken(identifier);
      return NextResponse.json({ requires_2fa: true, totp_token: totpToken });
    }

    const token = await createSession();
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    const mustChangePassword = await isDefaultPassword();

    return NextResponse.json({ ok: true, must_change_password: mustChangePassword });
  } catch (e) {
    return apiCatch(e);
  }
}
