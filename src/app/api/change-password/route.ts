import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateSession } from '@/lib/auth';
import { getSetting, setSetting } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    if (!(await validateSession(session))) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { current_email, current_password, new_email, new_password } = await req.json();

    if (!current_password) {
      return NextResponse.json({ ok: false, error: 'Current password is required' }, { status: 400 });
    }

    const storedEmail = (await getSetting('auth_email')) || 'admin';
    const storedPassword = (await getSetting('auth_password')) || 'admin';
    if ((current_email || storedEmail) !== storedEmail || current_password !== storedPassword) {
      return NextResponse.json({ ok: false, error: 'Current credentials are incorrect' }, { status: 403 });
    }

    if (new_email) {
      await setSetting('auth_email', new_email);
    }
    if (new_password) {
      if (new_password.length < 4) {
        return NextResponse.json({ ok: false, error: 'Password must be at least 4 characters' }, { status: 400 });
      }
      await setSetting('auth_password', new_password);
    }

    return NextResponse.json({ ok: true, message: 'Credentials updated' });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
