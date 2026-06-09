// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  return {
    cookies: vi.fn(() => ({
      get: (key: string) => {
        const val = store.get(key);
        return val ? { value: val } : undefined;
      },
      set: vi.fn((key: string, value: string) => { store.set(key, value); }),
    })),
  };
});

const mockRateLimit = vi.fn();
const mockGetClientIp = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mockRateLimit,
  getClientIp: mockGetClientIp,
}));

vi.mock('@/lib/errors', () => ({
  ErrorCodes: {
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
    AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    VALIDATION_INVALID_JSON: 'VALIDATION_INVALID_JSON',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    FORBIDDEN: 'FORBIDDEN',
    CSRF_FAILED: 'CSRF_FAILED',
    MISSING_FIELD: 'MISSING_FIELD',
    INVALID_VALUE: 'INVALID_VALUE',
    SSE_LIMIT_REACHED: 'SSE_LIMIT_REACHED',
  },
  apiCatch: vi.fn((e: unknown) =>
    new Response(JSON.stringify({ ok: false, error: String(e), code: 'INTERNAL_ERROR' }), { status: 500, headers: { 'content-type': 'application/json' } })
  ),
  apiError: vi.fn((code: string, message: string, status: number) =>
    new Response(JSON.stringify({ ok: false, error: message, code }), { status, headers: { 'content-type': 'application/json' } })
  ),
  requireJson: vi.fn(() => null),
}));

const mockValidateCredentials = vi.fn();
const mockCreateSession = vi.fn();
const mockIsDefaultPassword = vi.fn();

vi.mock('@/lib/auth', () => ({
  validateCredentials: mockValidateCredentials,
  createSession: mockCreateSession,
  isDefaultPassword: mockIsDefaultPassword,
}));

vi.mock('@/lib/db', () => {
  const store = new Map<string, string>();
  return {
    getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
    getUserByEmail: vi.fn(async (email: string) => ({ id: 1, email, role: 'admin' })),
    logAuditEntry: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/totp', () => ({
  createTotpTempToken: vi.fn(() => 'mock-totp-token'),
}));

vi.mock('@/lib/schemas', () => {
  const safeParse = vi.fn();
  return {
    LoginSchema: { safeParse },
  };
});

vi.mock('@/lib/lockout', () => ({
  recordFailedAttempt: vi.fn(async () => ({ locked: false, remainingMs: 0 })),
  resetAttempts: vi.fn(async () => {}),
  getLockoutStatus: vi.fn(async () => ({ locked: false, remainingMs: 0 })),
  MAX_ATTEMPTS: 5,
}));

vi.mock('@/lib/notifications', () => ({
  addNotification: vi.fn(async () => {}),
}));

describe('POST /api/login', () => {
  beforeEach(async () => {
    mockRateLimit.mockReset();
    mockGetClientIp.mockReset();
    mockValidateCredentials.mockReset();
    mockCreateSession.mockReset();
    mockIsDefaultPassword.mockReset();

    mockRateLimit.mockResolvedValue(null);
    mockGetClientIp.mockReturnValue('127.0.0.1');

    const { LoginSchema } = await import('@/lib/schemas');
    (LoginSchema.safeParse as ReturnType<typeof vi.fn>).mockReset();

    const { getLockoutStatus, recordFailedAttempt } = await import('@/lib/lockout');
    (getLockoutStatus as ReturnType<typeof vi.fn>).mockReset();
    (getLockoutStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ locked: false, remainingMs: 0 });
    (recordFailedAttempt as ReturnType<typeof vi.fn>).mockReset();
    (recordFailedAttempt as ReturnType<typeof vi.fn>).mockResolvedValue({ locked: false, remainingMs: 0 });

    const { getSetting } = await import('@/lib/db');
    (getSetting as ReturnType<typeof vi.fn>).mockReset();
    (getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('rejects invalid JSON body', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_INVALID_JSON');
  });

  it('rejects when zod validation fails', async () => {
    const { LoginSchema } = await import('@/lib/schemas');
    (LoginSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: false,
      error: { flatten: () => ({ formErrors: [], fieldErrors: { email: ['Invalid email'] } }) },
    });
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects locked account', async () => {
    const { LoginSchema } = await import('@/lib/schemas');
    (LoginSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: true,
      data: { email: 'admin@test.com', password: 'pass' },
    });
    const { getLockoutStatus } = await import('@/lib/lockout');
    (getLockoutStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ locked: true, remainingMs: 300_000 });
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'pass' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('AUTH_ACCOUNT_LOCKED');
  });

  it('rejects invalid credentials', async () => {
    const { LoginSchema } = await import('@/lib/schemas');
    (LoginSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: true,
      data: { email: 'admin@test.com', password: 'wrong' },
    });
    mockValidateCredentials.mockResolvedValue(false);
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'wrong' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('returns 2fa token when totp enabled', async () => {
    const { LoginSchema } = await import('@/lib/schemas');
    (LoginSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: true,
      data: { email: 'admin@test.com', password: 'correct' },
    });
    mockValidateCredentials.mockResolvedValue(true);
    const { getSetting } = await import('@/lib/db');
    (getSetting as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key === 'totp_enabled') return 'true';
      return null;
    });
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'correct' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.requires_2fa).toBe(true);
    expect(body.totp_token).toBe('mock-totp-token');
    expect(body).not.toHaveProperty('ok');
  });

  it('returns session on successful login', async () => {
    const { LoginSchema } = await import('@/lib/schemas');
    (LoginSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: true,
      data: { email: 'admin@test.com', password: 'correct' },
    });
    mockValidateCredentials.mockResolvedValue(true);
    mockCreateSession.mockResolvedValue('session-token-abc');
    mockIsDefaultPassword.mockResolvedValue(false);
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'correct' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.must_change_password).toBe(false);
  });

  it('sets must_change_password when using default credentials', async () => {
    const { LoginSchema } = await import('@/lib/schemas');
    (LoginSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: true,
      data: { email: 'admin@test.com', password: 'admin' },
    });
    mockValidateCredentials.mockResolvedValue(true);
    mockCreateSession.mockResolvedValue('session-token-xyz');
    mockIsDefaultPassword.mockResolvedValue(true);
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'admin' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.must_change_password).toBe(true);
  });

  it('is rate limited on repeated attempts', async () => {
    mockRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'Too many requests', code: 'RATE_LIMITED' }), { status: 429, headers: { 'content-type': 'application/json' } })
    );
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'pass' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
