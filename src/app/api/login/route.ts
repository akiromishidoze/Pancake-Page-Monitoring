import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { cookies } from 'next/headers';
import { validateCredentials, createSession, isDefaultPassword } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { LoginSchema } from '@/lib/schemas';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimited = rateLimit(ip, { store: 'login' });
    if (rateLimited) return rateLimited;

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

    if (!(await validateCredentials(identifier, password))) {
      return apiError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid credentials', 401);
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
