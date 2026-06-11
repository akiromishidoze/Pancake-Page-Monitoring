import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { cookies } from 'next/headers';
import { clearSession, withAuth } from '@/lib/auth';
import { logAuditEntry } from '@/lib/db';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export const POST = withAuth(async () => {
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    await clearSession(session);
    cookieStore.set(SESSION_COOKIE_NAME, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    void logAuditEntry('logout', 'auth', 'admin', 'User logged out');
    return NextResponse.json({ ok: true });
});
