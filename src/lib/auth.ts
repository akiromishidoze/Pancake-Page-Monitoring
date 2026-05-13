import { NextResponse } from 'next/server';
import { getSetting, setSetting } from './db';

const DEFAULT_EMAIL = 'admin';
const DEFAULT_PASSWORD = 'admin'; // fallback only; replaced on first boot
let _credsInitialized = false;

export function ensureCredentials(): void {
  if (_credsInitialized) return;
  _credsInitialized = true;

  const existing = getSetting('auth_password');
  if (existing) return;

  const password = crypto.randomUUID().slice(0, 16);
  setSetting('auth_email', DEFAULT_EMAIL);
  setSetting('auth_password', password);
  // Only log on first boot in development; store permanently
  console.log('═══════════════════════════════════════');
  console.log('  First-time setup: default credentials');
  console.log(`  Email:    ${DEFAULT_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log('  Change them in Settings > Change Password');
  console.log('═══════════════════════════════════════');
}

export function validateCredentials(email: string, password: string): boolean {
  const storedEmail = getSetting('auth_email') || DEFAULT_EMAIL;
  const storedPassword = getSetting('auth_password') || DEFAULT_PASSWORD;
  return email === storedEmail && password === storedPassword;
}

export function createSession(): string {
  const token = crypto.randomUUID();
  setSetting('session_token', token);
  return token;
}

export function validateSession(token: string | null | undefined): boolean {
  if (!token) return false;
  const stored = getSetting('session_token');
  return stored === token;
}

export function clearSession(): void {
  setSetting('session_token', '');
}

export async function requireApiAuth(): Promise<NextResponse | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  if (!validateSession(session)) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  return null;
}
