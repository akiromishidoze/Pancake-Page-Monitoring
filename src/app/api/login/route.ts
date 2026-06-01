import { NextResponse } from 'next/server';
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
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = LoginSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, password } = parsed.data;

    if (!(await validateCredentials(email, password))) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
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
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
