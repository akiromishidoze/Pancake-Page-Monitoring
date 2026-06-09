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
  pool: { query: vi.fn() },
  getSetting: vi.fn(async (key: string) => mockSettings.get(key) ?? null),
  listEndpoints: vi.fn(async () => []),
}));

vi.mock('@/lib/cors', () => ({
  cors: vi.fn((res: Response) => res),
  corsOptions: vi.fn(() => new Response(null, { status: 204 })),
}));

vi.mock('@/lib/botcake', () => ({
  getBotCakeApiHealth: vi.fn(() => new Map()),
}));

vi.mock('@/lib/errors', () => ({
  ErrorCodes: { INTERNAL_ERROR: 'INTERNAL_ERROR' },
  apiCatch: vi.fn((e: unknown) =>
    new Response(JSON.stringify({ ok: false, error: String(e), code: 'INTERNAL_ERROR' }), { status: 500, headers: { 'content-type': 'application/json' } })
  ),
}));

describe('GET /api/health', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockSettings.clear();
    const { getSetting, listEndpoints } = await import('@/lib/db');
    (getSetting as ReturnType<typeof vi.fn>).mockReset();
    (listEndpoints as ReturnType<typeof vi.fn>).mockReset();
    (listEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('returns ok with db connected when healthy', async () => {
    const { pool } = await import('@/lib/db');
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.db).toBe('connected');
    expect(body).toHaveProperty('db_latency_ms');
    expect(typeof body.db_latency_ms).toBe('number');
    expect(body).toHaveProperty('poll_interval_ms');
    expect(body).toHaveProperty('endpoints');
    expect(body).toHaveProperty('botcake_api');
  });

  it('returns disconnected when db query fails', async () => {
    const { pool } = await import('@/lib/db');
    (pool.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection refused'));
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.db).toBe('disconnected');
    expect(body.db_error).toBe('connection refused');
    expect(body.db_latency_ms).toBeNull();
  });

  it('reports stale endpoints', async () => {
    const { pool } = await import('@/lib/db');
    const { listEndpoints, getSetting } = await import('@/lib/db');
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    (listEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ep-1', name: 'Test Endpoint', is_active: true },
    ]);
    const staleTime = Date.now() - 200_000;
    (getSetting as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key === 'poller_ok_ep-1') return String(staleTime);
      return null;
    });
    const { GET } = await import('../route');
    const res = await GET();
    const body = await res.json();
    expect(body.endpoints).toHaveLength(1);
    expect(body.endpoints[0].stale).toBe(true);
    expect(body.endpoints[0].ok).toBe(false);
    expect(body.ok).toBe(false);
  });

  it('reports fresh endpoints as ok', async () => {
    const { pool } = await import('@/lib/db');
    const { listEndpoints, getSetting } = await import('@/lib/db');
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    (listEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ep-1', name: 'Fresh Endpoint', is_active: true },
    ]);
    (getSetting as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key === 'poller_ok_ep-1') return String(Date.now());
      return null;
    });
    const { GET } = await import('../route');
    const res = await GET();
    const body = await res.json();
    expect(body.endpoints[0].stale).toBe(false);
    expect(body.endpoints[0].ok).toBe(true);
    expect(body.ok).toBe(true);
  });

  it('returns ok false when no endpoint has data', async () => {
    const { pool } = await import('@/lib/db');
    const { listEndpoints } = await import('@/lib/db');
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    (listEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ep-1', name: 'No Data', is_active: true },
    ]);
    const { GET } = await import('../route');
    const res = await GET();
    const body = await res.json();
    expect(body.endpoints[0].last_run_ms).toBeNull();
    expect(body.ok).toBe(false);
  });

  it('handles OPTIONS request', async () => {
    const { OPTIONS } = await import('../route');
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });
});
