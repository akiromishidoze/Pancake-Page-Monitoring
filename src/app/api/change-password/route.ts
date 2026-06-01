import { NextResponse } from 'next/server';
import { validateCredentials, hashPassword } from '@/lib/auth';
import { setSetting, logAuditEntry } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { ChangePasswordSchema } from '@/lib/schemas';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimited = rateLimit(ip, { store: 'change-password', max: 5 });
    if (rateLimited) return rateLimited;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = ChangePasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { current_email, current_password, new_email, new_password } = parsed.data;

    // Validate current credentials using bcrypt-aware comparison
    if (!(await validateCredentials(current_email, current_password))) {
      return NextResponse.json({ ok: false, error: 'Current credentials are incorrect' }, { status: 403 });
    }

    if (new_email) {
      await setSetting('auth_email', new_email);
    }

    const changes: string[] = [];

    if (new_password) {
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
