import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSession } from '@/lib/auth';

export async function POST() {
  await clearSession();
  const cookieStore = await cookies();
  cookieStore.set('session', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });

  return NextResponse.json({ ok: true });
}
