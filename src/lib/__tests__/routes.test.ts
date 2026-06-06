// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted shared state (available in both mock factories and tests) ──

const mocks = vi.hoisted(() => {
  const cookieStore = new Map<string, string>();
  const dbSettings = new Map<string, string>();
  const dbEndpoints: Array<Record<string, unknown>> = [];

  function getEndpointByApiKey(key: string) {
    return dbEndpoints.find(e => e.api_key === key && e.is_active !== false) || null;
  }

  return {
    cookieStore,
    dbSettings,
    dbEndpoints,
    getEndpointByApiKey,
    resetAll() {
      cookieStore.clear();
      dbSettings.clear();
      dbEndpoints.length = 0;
      dbSettings.set('retention_days', '90');
    },
  };
});

// ── Helpers ─────────────────────────────────────────────────────────

async function jsonResponse(res: Response): Promise<{ status: number; body: any }> {
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) };
}

function mockRequest(method: string, url: string, opts?: { body?: unknown; headers?: Record<string, string> }): Request {
  const headers = new Headers(opts?.headers || {});
  if (opts?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Request(url, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: (key: string) => {
      const val = mocks.cookieStore.get(key);
      return val ? { value: val } : undefined;
    },
    set: (key: string, value: string) => { mocks.cookieStore.set(key, value); },
    delete: (key: string) => { mocks.cookieStore.delete(key); },
  })),
}));

vi.mock('@/lib/db', () => ({
  getSetting: vi.fn(async (key: string) => mocks.dbSettings.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => { mocks.dbSettings.set(key, value); }),
  listEndpoints: vi.fn(async () => [...mocks.dbEndpoints]),
  upsertEndpoint: vi.fn(async (data: Record<string, unknown>) => {
    const existing = mocks.dbEndpoints.findIndex(e => e.id === data.id);
    if (existing >= 0) {
      mocks.dbEndpoints[existing] = { ...mocks.dbEndpoints[existing], ...data };
      return mocks.dbEndpoints[existing];
    }
    const ep = { id: '', ...data, created_at: new Date().toISOString() };
    mocks.dbEndpoints.push(ep);
    return ep;
  }),
  getEndpointByApiKey: vi.fn(async (key: string) => mocks.getEndpointByApiKey(key)),
  toSlimPage: vi.fn((src: Record<string, unknown>) => ({
    name: (src.name as string) ?? 'Unknown',
    page_id: (src.page_id as string) ?? '',
    id: (src.page_id as string) ?? '',
  })),
  insertSnapshot: vi.fn(async () => ({ inserted: true })),
  touchEndpoint: vi.fn(async () => {}),
  logAuditEntry: vi.fn(async () => {}),
  queryRows: vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('SELECT COUNT(*)')) return [{ c: '2' }];
    if (sql.includes('SELECT DISTINCT action')) return [{ action: 'login' }, { action: 'logout' }, { action: 'update_retention' }];
    if (sql.includes('SELECT DISTINCT entity_type')) return [{ entity_type: 'auth' }, { entity_type: 'settings' }];
    return [
      { id: 1, action: 'login', entity_type: 'auth', entity_id: 'admin', detail: 'Successful login', ip_address: '127.0.0.1', created_at: '2025-01-01T00:00:00Z' },
      { id: 2, action: 'logout', entity_type: 'auth', entity_id: 'admin', detail: 'User logged out', ip_address: '127.0.0.1', created_at: '2025-01-02T00:00:00Z' },
    ];
  }),
  pool: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock('@/lib/notify', () => ({
  checkAlertsForRun: vi.fn(async () => {}),
}));

vi.mock('@/lib/sse', () => ({
  broadcastSSE: vi.fn(),
}));

vi.mock('@/lib/cors', () => ({
  corsReflectOrigin: vi.fn((res: Response) => res),
  corsOptions: vi.fn(() => new Response(null, { status: 204 })),
  cors: vi.fn((res: Response) => res),
}));

vi.mock('@/lib/auth', () => ({
  validateCredentials: vi.fn(async (email: string, password: string) => {
    return email === 'admin' && password === 'admin';
  }),
  createSession: vi.fn(async () => 'test-session-token'),
  clearSession: vi.fn(async () => {}),
  isDefaultPassword: vi.fn(async () => false),
  requireApiAuth: vi.fn(async () => null),
  withAuth: vi.fn(<T extends (...args: any[]) => any>(handler: T) => handler),
}));

describe('GET /api/audit-log', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns paginated entries', async () => {
    const mod = await import('@/app/api/audit-log/route');
    const req = mockRequest('GET', 'http://localhost/api/audit-log?limit=10&offset=0');
    const res = await mod.GET(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.entries).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  it('returns distinct actions and entity_types', async () => {
    const mod = await import('@/app/api/audit-log/route');
    const req = mockRequest('GET', 'http://localhost/api/audit-log');
    const { body } = await jsonResponse(await mod.GET(req));
    expect(body.actions).toContain('login');
    expect(body.actions).toContain('logout');
    expect(body.entity_types).toContain('auth');
    expect(body.entity_types).toContain('settings');
  });

  it('filters by action', async () => {
    const { queryRows } = await import('@/lib/db');
    const mod = await import('@/app/api/audit-log/route');
    const req = mockRequest('GET', 'http://localhost/api/audit-log?action=login');
    await mod.GET(req);
    const callParams = vi.mocked(queryRows).mock.calls.find(c =>
      String(c[0]).includes('SELECT * FROM audit_log')
    );
    expect(callParams).toBeDefined();
    expect(String(callParams![1]?.[0])).toBe('login');
  });

  it('filters by entity_type', async () => {
    const { queryRows } = await import('@/lib/db');
    const mod = await import('@/app/api/audit-log/route');
    const req = mockRequest('GET', 'http://localhost/api/audit-log?entity_type=settings');
    await mod.GET(req);
    const callParams = vi.mocked(queryRows).mock.calls.find(c =>
      String(c[0]).includes('SELECT * FROM audit_log')
    );
    expect(callParams).toBeDefined();
    expect(String(callParams![1]?.[0])).toBe('settings');
  });

  it('filters by date range', async () => {
    const { queryRows } = await import('@/lib/db');
    const mod = await import('@/app/api/audit-log/route');
    const req = mockRequest('GET', 'http://localhost/api/audit-log?date_from=2025-01-01&date_to=2025-01-31');
    await mod.GET(req);
    const callParams = vi.mocked(queryRows).mock.calls.find(c =>
      String(c[0]).includes('SELECT * FROM audit_log')
    );
    expect(callParams).toBeDefined();
    expect(String(callParams![1]?.[0])).toBe('2025-01-01');
    expect(String(callParams![1]?.[1])).toBe('2025-01-31');
  });

  it('enforces max limit of 500', async () => {
    const mod = await import('@/app/api/audit-log/route');
    const req = mockRequest('GET', 'http://localhost/api/audit-log?limit=9999');
    const { body } = await jsonResponse(await mod.GET(req));
    expect(body.limit).toBe(500);
  });

  it('returns empty arrays when no data', async () => {
    const { queryRows } = await import('@/lib/db');
    vi.mocked(queryRows).mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT COUNT(*)')) return [{ c: '0' }];
      if (sql.includes('SELECT DISTINCT')) return [];
      return [];
    });
    const mod = await import('@/app/api/audit-log/route');
    const req = mockRequest('GET', 'http://localhost/api/audit-log');
    const { body } = await jsonResponse(await mod.GET(req));
    expect(body.entries).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.actions).toEqual([]);
    expect(body.entity_types).toEqual([]);
  });
});

describe('GET /api/health', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns ok false when no endpoints exist', async () => {
    const mod = await import('@/app/api/health/route');
    const res = await mod.GET();
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: false, db: 'connected', endpoints: [] });
  });

  it('reports endpoints without recent data as not stale (no data yet)', async () => {
    mocks.dbEndpoints.push({ id: 'ep1', name: 'Test EP', is_active: true });
    const mod = await import('@/app/api/health/route');
    const res = await mod.GET();
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body.endpoints).toHaveLength(1);
    expect(body.endpoints[0]).toMatchObject({ endpoint_id: 'ep1', name: 'Test EP', last_run_ms: null, stale: false, ok: true });
  });

  it('reports ok true when endpoints have recent data', async () => {
    const recent = Date.now() - 10_000;
    mocks.dbEndpoints.push({ id: 'ep1', name: 'Test EP', is_active: true });
    mocks.dbSettings.set('poller_ok_ep1', String(recent));
    const mod = await import('@/app/api/health/route');
    const res = await mod.GET();
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body.endpoints[0].ok).toBe(true);
    expect(body.endpoints[0].stale).toBe(false);
  });
});

describe('POST /api/login', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns 200 with session cookie for valid credentials', async () => {
    const mod = await import('@/app/api/login/route');
    const req = mockRequest('POST', 'http://localhost/api/login', { body: { email: 'admin', password: 'admin' } });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(mocks.cookieStore.has('session')).toBe(true);
  });

  it('returns 401 for invalid credentials', async () => {
    const mod = await import('@/app/api/login/route');
    const req = mockRequest('POST', 'http://localhost/api/login', { body: { email: 'admin', password: 'wrong' } });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(401);
    expect(body).toMatchObject({ ok: false, code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('returns 400 for missing password', async () => {
    const mod = await import('@/app/api/login/route');
    const req = mockRequest('POST', 'http://localhost/api/login', { body: { email: 'admin' } });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns 400 for invalid JSON body', async () => {
    const mod = await import('@/app/api/login/route');
    const req = new Request('http://localhost/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_INVALID_JSON' });
  });
});

describe('POST /api/logout', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('clears session cookie and returns 200', async () => {
    mocks.cookieStore.set('session', 'test-token');
    const mod = await import('@/app/api/logout/route');
    const res = await mod.POST();
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(mocks.cookieStore.get('session')).toBe('');
  });
});

describe('GET /api/endpoints', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns empty list when no endpoints', async () => {
    const mod = await import('@/app/api/endpoints/route');
    const res = await mod.GET();
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, endpoints: [] });
  });

  it('returns masked api_key in response', async () => {
    mocks.dbEndpoints.push({ id: 'ep1', name: 'Test EP', api_key: 'sk-abc123xyz789' });
    const mod = await import('@/app/api/endpoints/route');
    const res = await mod.GET();
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body.endpoints[0].api_key).toBe('sk-abc12...z789');
  });
});

describe('POST /api/endpoints', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('creates a new endpoint with valid data', async () => {
    const mod = await import('@/app/api/endpoints/route');
    const req = mockRequest('POST', 'http://localhost/api/endpoints', {
      body: { name: 'New EP', api_key: 'sk-new-key' },
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(mocks.dbEndpoints).toHaveLength(1);
    expect(mocks.dbEndpoints[0].name).toBe('New EP');
  });

  it('returns 400 when name is missing', async () => {
    const mod = await import('@/app/api/endpoints/route');
    const req = mockRequest('POST', 'http://localhost/api/endpoints', {
      body: { api_key: 'sk-new-key' },
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('returns 400 for invalid JSON', async () => {
    const mod = await import('@/app/api/endpoints/route');
    const req = new Request('http://localhost/api/endpoints', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_INVALID_JSON' });
  });
});

describe('GET /api/settings', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns default retention_days', async () => {
    const mod = await import('@/app/api/settings/route');
    const res = await mod.GET();
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, settings: { retention_days: '90' } });
  });
});

describe('POST /api/settings', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('updates retention_days', async () => {
    const mod = await import('@/app/api/settings/route');
    const req = mockRequest('POST', 'http://localhost/api/settings', {
      body: { retention_days: 30 },
    });
    const res = await mod.POST(req);
    const { status } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(mocks.dbSettings.get('retention_days')).toBe('30');
  });

  it('returns 400 for negative retention_days', async () => {
    const mod = await import('@/app/api/settings/route');
    const req = mockRequest('POST', 'http://localhost/api/settings', {
      body: { retention_days: -1 },
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'INVALID_VALUE' });
  });
});

describe('POST /api/ingest', () => {
  beforeEach(() => { mocks.resetAll(); vi.clearAllMocks(); });

  it('returns 401 when X-Api-Key header is missing', async () => {
    const mod = await import('@/app/api/ingest/route');
    const req = mockRequest('POST', 'http://localhost/api/ingest', {
      body: { run_id: 'test-run', rows: [], summary: {} },
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(401);
    expect(body).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('returns 401 for invalid API key', async () => {
    const mod = await import('@/app/api/ingest/route');
    const req = mockRequest('POST', 'http://localhost/api/ingest', {
      headers: { 'x-api-key': 'invalid-key' },
      body: { run_id: 'test-run', rows: [], summary: {} },
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(401);
    expect(body).toMatchObject({ code: 'AUTH_KEY_INVALID' });
  });

  it('processes valid request successfully', async () => {
    mocks.dbEndpoints.push({ id: 'ep1', name: 'Test EP', api_key: 'valid-key', is_active: true });
    const mod = await import('@/app/api/ingest/route');
    const req = mockRequest('POST', 'http://localhost/api/ingest', {
      headers: { 'x-api-key': 'valid-key' },
      body: {
        run_id: 'test-run-1',
        status: 'fresh',
        rows: [
          { page_id: 'p1', page_name: 'Page 1', is_activated: true },
        ],
        summary: { run_quality: 'good' },
      },
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, inserted: true, endpoint: 'Test EP' });
  });

  it('returns 400 for invalid request body', async () => {
    mocks.dbEndpoints.push({ id: 'ep1', name: 'Test EP', api_key: 'valid-key', is_active: true });
    const mod = await import('@/app/api/ingest/route');
    const req = mockRequest('POST', 'http://localhost/api/ingest', {
      headers: { 'x-api-key': 'valid-key' },
      body: { run_id: 123, rows: 'invalid' },
    });
    const res = await mod.POST(req);
    const { status, body } = await jsonResponse(res);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
