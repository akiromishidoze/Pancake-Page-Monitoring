import { describe, it, expect, vi, beforeEach } from 'vitest';

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
