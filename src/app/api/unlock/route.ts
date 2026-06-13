import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { withAuth } from '@/lib/auth';
import { resetAttempts } from '@/lib/lockout';
import { logAuditEntry } from '@/lib/db';
import { rateLimitRoute } from '@/lib/rate-limit-guard';

export const POST = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
    const { identifier } = await req.json();
    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json({ error: 'identifier is required' }, { status: 400 });
    }
    await resetAttempts(identifier);
    void logAuditEntry('unlock', 'auth', identifier, 'Account unlocked by admin');
    return NextResponse.json({ ok: true });
});
