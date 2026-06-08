import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { createSession } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getSetting, logAuditEntry } from '@/lib/db';
import { TotpLoginSchema } from '@/lib/schemas';
import { verifyTOTP, consumeTotpTempToken } from '@/lib/totp';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'totp-login', max: 5 });
    if (rateLimited) return rateLimited;

    const ctErr = requireJson(req);
    if (ctErr) return ctErr;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = TotpLoginSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const { totp_token, code } = parsed.data;
    const identifier = consumeTotpTempToken(totp_token);
    if (!identifier) {
      return apiError(ErrorCodes.AUTH_TOTP_INVALID, 'Invalid or expired TOTP token. Please log in again.', 401);
    }

    const secret = await getSetting('totp_secret');
    if (!secret) {
      return apiError(ErrorCodes.AUTH_TOTP_INVALID, 'TOTP not configured', 400);
    }

    if (!verifyTOTP(code, secret)) {
      return apiError(ErrorCodes.AUTH_TOTP_INVALID, 'Invalid code', 401);
    }

    const session = await createSession();
    const cookieStore = await cookies();
    cookieStore.set('session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    void logAuditEntry('totp_login', 'auth', identifier, `Successful TOTP login from ${ip}`, ip);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiCatch(e);
  }
}
