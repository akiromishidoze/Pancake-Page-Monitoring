import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { withAuth, clearSession } from '@/lib/auth';
import { logAuditEntry } from '@/lib/db';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/session';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const POST = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    await clearSession(session);
    cookieStore.set(SESSION_COOKIE_NAME, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    void logAuditEntry('logout', 'auth', 'admin', 'User logged out');
    return NextResponse.json({ ok: true });
});
