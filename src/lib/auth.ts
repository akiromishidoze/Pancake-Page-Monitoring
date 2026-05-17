import { NextResponse } from 'next/server';
import { getSetting, setSetting } from './db';

const DEFAULT_EMAIL = 'admin';
const DEFAULT_PASSWORD = 'admin'; // fallback only; replaced on first boot
let _credsInitialized = false;

export async function ensureCredentials(): Promise<void> {
  if (_credsInitialized) return;
  _credsInitialized = true;

  const existing = await getSetting('auth_password');
  if (existing) return;

  const password = crypto.randomUUID().slice(0, 16);
  await setSetting('auth_email', DEFAULT_EMAIL);
  await setSetting('auth_password', password);
  console.log('═══════════════════════════════════════');
  console.log('  First-time setup: default credentials');
  console.log(`  Email:    ${DEFAULT_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log('  Change them in Settings > Change Password');
  console.log('═══════════════════════════════════════');
}

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const storedEmail = (await getSetting('auth_email')) || DEFAULT_EMAIL;
  const storedPassword = (await getSetting('auth_password')) || DEFAULT_PASSWORD;
  return email === storedEmail && password === storedPassword;
}

export async function createSession(): Promise<string> {
  const token = crypto.randomUUID();
  await setSetting('session_token', token);
  return token;
}

export async function validateSession(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const stored = await getSetting('session_token');
  return stored === token;
}

export async function clearSession(): Promise<void> {
  await setSetting('session_token', '');
}

export async function requireApiAuth(): Promise<NextResponse | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  if (!(await validateSession(session))) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  return null;
}
