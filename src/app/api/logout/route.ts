import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSession } from '@/lib/auth';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    await clearSession(session);
    cookieStore.set('session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
