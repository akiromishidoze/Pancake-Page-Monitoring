import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSetting, setSetting, createSessionToken, validateSessionToken, clearSessionToken, getUserByEmail, getUserById, createUser, getUserCount } from './db';
import { ErrorCodes, apiCatch, apiError, requireJson } from './errors';
import { checkCsrf } from './csrf';
import { SESSION_COOKIE_NAME } from './session';
import { createLogger } from './logger';

const log = createLogger('auth');

const BCRYPT_ROUNDS = 12;
const DEFAULT_EMAIL = process.env['DEFAULT_ADMIN_EMAIL'] || 'admin';
const DEFAULT_PASSWORD = process.env['DEFAULT_ADMIN_PASSWORD'] || 'admin';

let _credsInitialized = false;

function isBcryptHash(value: string): boolean {
  return value.startsWith('$2b$') || value.startsWith('$2a$');
}

export async function ensureCredentials(): Promise<void> {
  if (_credsInitialized) return;
  _credsInitialized = true;

  const count = await getUserCount();
  if (count > 0) return;

  const existingPassword = await getSetting('auth_password');
  if (existingPassword) {
    const existingEmail = (await getSetting('auth_email')) || DEFAULT_EMAIL;
    const pwHash = isBcryptHash(existingPassword) ? existingPassword : await bcrypt.hash(existingPassword, BCRYPT_ROUNDS);
    await createUser(existingEmail, existingEmail, pwHash, 'admin');
    log.info('Migrated existing credentials to users table');
    return;
  }

  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
  await createUser(DEFAULT_EMAIL, DEFAULT_EMAIL, hashed, 'admin');
  if (process.env['DEFAULT_ADMIN_PASSWORD']) {
    log.warn('Admin user created from DEFAULT_ADMIN_PASSWORD env var. Change the password in Settings.');
  } else {
    log.error('Default admin user created with hardcoded credentials (admin/admin). Set DEFAULT_ADMIN_PASSWORD env var to use a secure password on first run, then change it in Settings.');
  }
}

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const user = await getUserByEmail(email);
  if (!user || !user.is_active) return false;
  if (isBcryptHash(user.password_hash)) {
    return bcrypt.compare(password, user.password_hash);
  }
  return password === user.password_hash;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function isDefaultPassword(): Promise<boolean> {
  const user = await getUserByEmail(DEFAULT_EMAIL);
  if (!user) return false;
  return bcrypt.compare(DEFAULT_PASSWORD, user.password_hash);
}

export async function createSession(role?: string, userId?: number): Promise<string> {
  return createSessionToken(role, userId);
}

export async function requireAdminSession(token: string | null | undefined): Promise<boolean> {
  const { requireAdminSession: dbRequireAdmin } = await import('./db');
  return dbRequireAdmin(token);
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
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!(await validateSession(session))) {
    return NextResponse.json({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_REQUIRED }, { status: 401 });
  }
  return null;
}

export async function getSessionUser(): Promise<{ id: number; email: string; role: string } | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const { getSessionTokenUser } = await import('./db');
  return getSessionTokenUser(token);
}

type RouteHandler = (...args: any[]) => Promise<Response>;

const handlerLog = createLogger('handler');

function reqPath(req: unknown): { method: string; path: string } {
  if (req instanceof Request) {
    try { return { method: req.method, path: new URL(req.url).pathname }; } catch { /* fall through */ }
  }
  return { method: '?', path: '?' };
}

export function withTiming<T extends RouteHandler>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    const { method, path } = reqPath(args[0]);
    const start = Date.now();
    try {
      const res = await handler(...args);
      handlerLog.info({ method, path, status: res.status, durationMs: Date.now() - start }, 'handler');
      return res;
    } catch (e) {
      const errRes = apiCatch(e);
      handlerLog.info({ method, path, status: errRes.status, durationMs: Date.now() - start }, 'handler');
      return errRes;
    }
  }) as T;
}

export function withAuth<T extends RouteHandler>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    const { method, path } = reqPath(args[0]);
    const start = Date.now();

    try {
      const auth = await requireApiAuth();
      if (auth) {
        handlerLog.info({ method, path, status: auth.status, durationMs: Date.now() - start }, 'handler');
        return auth;
      }
      const req = args[0];
      if (req instanceof Request && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!checkCsrf(req)) {
          handlerLog.info({ method, path, status: 403, durationMs: Date.now() - start }, 'handler');
          return apiError(ErrorCodes.CSRF_FAILED, 'CSRF validation failed', 403);
        }
        const jsonErr = requireJson(req);
        if (jsonErr) {
          handlerLog.info({ method, path, status: jsonErr.status, durationMs: Date.now() - start }, 'handler');
          return jsonErr;
        }
      }
      const res = await handler(...args);
      handlerLog.info({ method, path, status: res.status, durationMs: Date.now() - start }, 'handler');
      return res;
    } catch (e) {
      const errRes = apiCatch(e);
      handlerLog.info({ method, path, status: errRes.status, durationMs: Date.now() - start }, 'handler');
      return errRes;
    }
  }) as T;
}
