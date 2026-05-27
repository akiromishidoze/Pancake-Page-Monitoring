import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateCredentials, createSession, isDefaultPassword } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimited = rateLimit(ip, { store: 'login' });
    if (rateLimited) return rateLimited;

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Email and password are required' }, { status: 400 });
    }

    if (!(await validateCredentials(email, password))) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }

    const token = await createSession();
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
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
