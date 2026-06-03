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
  apiCatch: vi.fn((e: unknown) =>
    new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } })
  ),
}));

vi.mock('@/lib/db', () => {
  const store = new Map<string, string>();
  const sessionTokens = new Map<string, string>();
  return {
    getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
    setSetting: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    createSessionToken: vi.fn(async () => {
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
  };
});

describe('ensureCredentials', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sets default credentials on first boot', async () => {
    const { ensureCredentials } = await import('@/lib/auth');
    const { getSetting, setSetting } = await import('@/lib/db');
    await ensureCredentials();
    expect(setSetting).toHaveBeenCalledWith('auth_email', 'admin');
    expect(setSetting).toHaveBeenCalledWith(
      'auth_password',
      expect.stringMatching(/^\$2[ab]\$\d+\$/),
    );
  });

  it('does not overwrite existing credentials', async () => {
    const { ensureCredentials } = await import('@/lib/auth');
    const { setSetting } = await import('@/lib/db');
    await ensureCredentials();
    const callCount = (setSetting as ReturnType<typeof vi.fn>).mock.calls.length;
    await ensureCredentials();
    expect((setSetting as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
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
    const result = await wrapped();
    expect(result.status).toBe(500);
  });
});
