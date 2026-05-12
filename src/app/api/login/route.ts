import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateCredentials, createSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Email and password are required' }, { status: 400 });
    }

    if (!validateCredentials(email, password)) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }

    const token = createSession();
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
