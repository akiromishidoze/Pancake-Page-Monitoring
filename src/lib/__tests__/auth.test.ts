// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionCookie = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: (key: string) => {
      const val = sessionCookie.get(key);
      return val ? { value: val } : undefined;
    },
  })),
}));

vi.mock('@/lib/errors', () => ({
  ErrorCodes: {
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    VALIDATION_INVALID_JSON: 'VALIDATION_INVALID_JSON',
    NOT_FOUND: 'NOT_FOUND',
    MISSING_FIELD: 'MISSING_FIELD',
    INVALID_VALUE: 'INVALID_VALUE',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },
  apiCatch: vi.fn((e: unknown) =>
    new Response(JSON.stringify({ ok: false, error: String(e), code: 'INTERNAL_ERROR' }), { status: 500, headers: { 'content-type': 'application/json' } })
  ),
  apiError: vi.fn((code: string, message: string, status: number) =>
    new Response(JSON.stringify({ ok: false, error: message, code }), { status, headers: { 'content-type': 'application/json' } })
  ),
  requireJson: vi.fn(() => null),
}));

vi.mock('@/lib/db', () => {
  const store = new Map<string, string>();
  const sessionTokens = new Map<string, string>();
  const users = new Map<number, { id: number; email: string; username: string | null; password_hash: string; role: string; is_active: boolean; created_at: string }>();
  let nextUserId = 1;
  return {
    getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
    setSetting: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    createSessionToken: vi.fn(async (role?: string) => {
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      sessionTokens.set(token, expires);
      return token;
    }),
    validateSessionToken: vi.fn(async (token: string | null | undefined) => {
      if (!token) return false;
      const expires = sessionTokens.get(token);
      if (!expires) return false;
      return new Date(expires) > new Date();
    }),
    clearSessionToken: vi.fn(async (token: string) => {
      sessionTokens.delete(token);
    }),
    pruneExpiredSessions: vi.fn(async () => {}),
    getUserCount: vi.fn(async () => users.size),
    getUserByEmail: vi.fn(async (email: string) => {
      for (const u of users.values()) {
        if (u.email === email) return u;
      }
      return undefined;
    }),
    getUserById: vi.fn(async (id: number) => users.get(id) ?? undefined),
    createUser: vi.fn(async (email: string, username: string | undefined, passwordHash: string, role?: string) => {
      const id = nextUserId++;
      const u = { id, email, username: username ?? email, password_hash: passwordHash, role: role ?? 'admin', is_active: true, created_at: new Date().toISOString() };
      users.set(id, u);
      return u;
    }),
    incrementPasswordVersion: vi.fn(async () => {}),
    clearAllSessions: vi.fn(async () => {}),
  };
});

describe('ensureCredentials', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sets default credentials on first boot', async () => {
    const { ensureCredentials } = await import('@/lib/auth');
    const { createUser, getUserCount } = await import('@/lib/db');
    expect(await getUserCount()).toBe(0);
    await ensureCredentials();
    expect(createUser).toHaveBeenCalledWith(
      'admin', 'admin',
      expect.stringMatching(/^\$2[ab]\$\d+\$/),
      'admin',
    );
    expect(await getUserCount()).toBe(1);
  });

  it('does not overwrite existing credentials', async () => {
    const { ensureCredentials } = await import('@/lib/auth');
    const { createUser } = await import('@/lib/db');
    await ensureCredentials();
    const callCount = (createUser as ReturnType<typeof vi.fn>).mock.calls.length;
    await ensureCredentials();
    expect((createUser as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
  });
});

describe('validateCredentials', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns true for matching credentials', async () => {
    const { validateCredentials, ensureCredentials } = await import('@/lib/auth');
    await ensureCredentials();
    const result = await validateCredentials('admin', 'admin');
    expect(result).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const { validateCredentials, ensureCredentials } = await import('@/lib/auth');
    await ensureCredentials();
    const result = await validateCredentials('admin', 'wrong');
    expect(result).toBe(false);
  });

  it('returns false for wrong email', async () => {
    const { validateCredentials, ensureCredentials } = await import('@/lib/auth');
    await ensureCredentials();
    const result = await validateCredentials('wrong@email.com', 'admin');
    expect(result).toBe(false);
  });
});

describe('createSession and validateSession', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a valid session token', async () => {
    const { createSession, validateSession } = await import('@/lib/auth');
    const token = await createSession();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    const valid = await validateSession(token);
    expect(valid).toBe(true);
  });

  it('rejects invalid session token', async () => {
    const { validateSession } = await import('@/lib/auth');
    const valid = await validateSession('fake-token');
    expect(valid).toBe(false);
  });

  it('rejects null/undefined token', async () => {
    const { validateSession } = await import('@/lib/auth');
    expect(await validateSession(null)).toBe(false);
    expect(await validateSession(undefined)).toBe(false);
  });

  it('clearSession invalidates the token', async () => {
    const { createSession, validateSession, clearSession } = await import('@/lib/auth');
    const token = await createSession();
    expect(await validateSession(token)).toBe(true);
    await clearSession(token);
    expect(await validateSession(token)).toBe(false);
  });
});

describe('requireApiAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionCookie.clear();
  });

  it('returns 401 when no session cookie', async () => {
    const { requireApiAuth } = await import('@/lib/auth');
    const result = await requireApiAuth();
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body).toMatchObject({ ok: false, error: 'Not authenticated' });
  });

  it('returns null when valid session cookie exists', async () => {
    const { createSession, requireApiAuth } = await import('@/lib/auth');
    const token = await createSession();
    sessionCookie.set('session', token);

    const result = await requireApiAuth();
    expect(result).toBeNull();
  });
});

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionCookie.clear();
  });

  it('returns 401 when auth fails', async () => {
    const { withAuth } = await import('@/lib/auth');
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withAuth(handler);
    const result = await wrapped();
    expect(result.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler when auth succeeds', async () => {
    const { createSession, withAuth } = await import('@/lib/auth');
    const token = await createSession();
    sessionCookie.set('session', token);

    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const wrapped = withAuth(handler);
    const result = await wrapped();
    expect(result.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('forwards handler arguments', async () => {
    const { createSession, withAuth } = await import('@/lib/auth');
    const token = await createSession();
    sessionCookie.set('session', token);

    const handler = vi.fn(async (a: number, b: string) => new Response(`${a}:${b}`, { status: 200 }));
    const wrapped = withAuth(handler);
    const result = await wrapped(42, 'hello');
    expect(result.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(42, 'hello');
  });

  it('wraps handler errors with apiCatch', async () => {
    const { createSession, withAuth } = await import('@/lib/auth');
    const token = await createSession();
    sessionCookie.set('session', token);

    const handler = vi.fn(async () => { throw new Error('handler exploded'); });
    const wrapped = withAuth(handler);
    const result = await wrapped() as Response;
    expect(result.status).toBe(500);
  });
});
