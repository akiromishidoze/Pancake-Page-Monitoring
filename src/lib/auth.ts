import { getSetting, setSetting } from './db';

const DEFAULT_EMAIL = 'admin';
const DEFAULT_PASSWORD = 'admin';

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
