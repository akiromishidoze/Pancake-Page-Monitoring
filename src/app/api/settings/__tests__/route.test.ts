// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSettings = new Map<string, string>();

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: ResponseInit) => {
      const headers = new Headers(init?.headers);
      return {
        status: init?.status ?? 200,
        headers,
        json: async () => body,
      } as unknown as Response;
    }),
  },
}));

vi.mock('@/lib/db', () => ({
  getSetting: vi.fn(async (key: string) => mockSettings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => { mockSettings.set(key, value); }),
  logAuditEntry: vi.fn(async () => {}),
}));

vi.mock('@/lib/errors', () => ({
  ErrorCodes: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    VALIDATION_INVALID_JSON: 'VALIDATION_INVALID_JSON',
    INVALID_VALUE: 'INVALID_VALUE',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    MISSING_FIELD: 'MISSING_FIELD',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
  },
  apiError: vi.fn((code: string, message: string, status: number) =>
    new Response(JSON.stringify({ ok: false, error: message, code }), { status, headers: { 'content-type': 'application/json' } })
  ),
  apiCatch: vi.fn((e: unknown) =>
    new Response(JSON.stringify({ ok: false, error: String(e), code: 'INTERNAL_ERROR' }), { status: 500, headers: { 'content-type': 'application/json' } })
  ),
}));

const mockHandler = vi.fn();
vi.mock('@/lib/auth', () => ({
  withAuth: vi.fn((fn: Function) => fn),
}));

vi.mock('@/lib/schemas', () => ({
  RetentionSettingsSchema: {
    safeParse: vi.fn(),
  },
}));

describe('GET /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.clear();
  });

  it('returns default retention_days when not set', async () => {
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.retention_days).toBe('90');
  });

  it('returns stored retention_days', async () => {
    mockSettings.set('retention_days', '45');
    const { GET } = await import('../route');
    const res = await GET();
    const body = await res.json();
    expect(body.settings.retention_days).toBe('45');
  });
});

describe('POST /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.clear();
  });

  it('updates retention_days with valid value', async () => {
    const { RetentionSettingsSchema } = await import('@/lib/schemas');
    (RetentionSettingsSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: true,
      data: { retention_days: '30' },
    });
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retention_days: '30' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockSettings.get('retention_days')).toBe('30');
  });

  it('rejects negative retention_days', async () => {
    const { RetentionSettingsSchema } = await import('@/lib/schemas');
    (RetentionSettingsSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: true,
      data: { retention_days: -1 },
    });
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retention_days: -1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_VALUE');
  });

  it('rejects invalid JSON', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects when zod validation fails', async () => {
    const { RetentionSettingsSchema } = await import('@/lib/schemas');
    (RetentionSettingsSchema.safeParse as ReturnType<typeof vi.fn>).mockReturnValue({
      success: false,
      error: { flatten: () => ({ formErrors: [], fieldErrors: { retention_days: ['Invalid'] } }) },
    });
    const { POST } = await import('../route');
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retention_days: 'abc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
