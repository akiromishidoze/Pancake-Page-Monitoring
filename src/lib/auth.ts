import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getSetting, setSetting, createSessionToken, validateSessionToken, clearSessionToken } from './db';

const BCRYPT_ROUNDS = 12;
const DEFAULT_EMAIL = 'admin';
const DEFAULT_PASSWORD = 'admin';

let _credsInitialized = false;

/**
 * Returns true if the value looks like a bcrypt hash (starts with $2b$ or $2a$).
 */
function isBcryptHash(value: string): boolean {
  return value.startsWith('$2b$') || value.startsWith('$2a$');
}

/**
 * On first boot: seed default hashed credentials if none exist.
 * On subsequent boots: transparently upgrade any plain-text password still in DB.
 */
export async function ensureCredentials(): Promise<void> {
  if (_credsInitialized) return;
  _credsInitialized = true;

  const existingPassword = await getSetting('auth_password');

  if (!existingPassword) {
    // First boot — store hashed defaults
    const hashed = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
    await setSetting('auth_email', DEFAULT_EMAIL);
    await setSetting('auth_password', hashed);
    console.warn('[auth] Default credentials initialized (hashed). Change them in Settings > Change Password.');
    return;
  }

  // Silently upgrade plain-text password to bcrypt hash
  if (!isBcryptHash(existingPassword)) {
    console.warn('[auth] Upgrading plain-text password to bcrypt hash...');
    const hashed = await bcrypt.hash(existingPassword, BCRYPT_ROUNDS);
    await setSetting('auth_password', hashed);
    console.log('[auth] Password upgraded successfully.');
  }
}

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const storedEmail = (await getSetting('auth_email')) || DEFAULT_EMAIL;
  const storedPassword = (await getSetting('auth_password')) || '';

  if (email !== storedEmail) return false;

  // Support both hashed (normal) and plain-text (legacy fallback only)
  if (isBcryptHash(storedPassword)) {
    return bcrypt.compare(password, storedPassword);
  }

  // Plain-text fallback (should only happen if DB was manually edited)
  return password === storedPassword;
}

/**
 * Hash a plain-text password using bcrypt.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function createSession(): Promise<string> {
  return createSessionToken();
}

export async function validateSession(token: string | null | undefined): Promise<boolean> {
  return validateSessionToken(token);
}

export async function clearSession(token?: string): Promise<void> {
  if (!token) return;
  await clearSessionToken(token);
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
