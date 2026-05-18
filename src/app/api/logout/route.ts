import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSession } from '@/lib/auth';

export async function POST() {
  try {
    await clearSession();
    const cookieStore = await cookies();
    cookieStore.set('session', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
