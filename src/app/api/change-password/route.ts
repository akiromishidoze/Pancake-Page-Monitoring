import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSession, validateCredentials, hashPassword } from '@/lib/auth';
import { setSetting, logAuditEntry } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimited = rateLimit(ip, { store: 'change-password', max: 5 });
    if (rateLimited) return rateLimited;
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    if (!(await validateSession(session))) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { current_email, current_password, new_email, new_password } = await req.json();

    if (!current_password) {
      return NextResponse.json({ ok: false, error: 'Current password is required' }, { status: 400 });
    }

    // Validate current credentials using bcrypt-aware comparison
    if (!(await validateCredentials(current_email || 'admin', current_password))) {
      return NextResponse.json({ ok: false, error: 'Current credentials are incorrect' }, { status: 403 });
    }

    if (new_email) {
      await setSetting('auth_email', new_email);
    }

    const changes: string[] = [];

    if (new_password) {
      if (new_password.length < 8) {
        return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      // Hash before storing — never save plain text
      const hashed = await hashPassword(new_password);
      await setSetting('auth_password', hashed);
      changes.push('password');
    }

    if (new_email) {
      changes.push('email');
    }

    if (changes.length > 0) {
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
      void logAuditEntry('update_credentials', 'auth', 'credentials', `Changed: ${changes.join(', ')}`, ip);
    }

    return NextResponse.json({ ok: true, message: 'Credentials updated' });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
