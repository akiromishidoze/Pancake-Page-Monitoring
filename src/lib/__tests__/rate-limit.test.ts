// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const _mockDb = new Map<string, { count: number; reset_at: string }>();

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      if (text.includes('SELECT')) {
        const key = params?.[0] + ':' + params?.[1];
        const entry = _mockDb.get(key);
        if (entry) {
          return { rows: [entry] };
        }
        return { rows: [] };
      }
      if (text.includes('INSERT') || text.includes('UPDATE')) {
        if (text.includes('count = 1')) {
          _mockDb.set(params?.[0] + ':' + params?.[1], { count: 1, reset_at: params?.[2] as string });
        } else if (text.includes('count = $1')) {
          const key = params?.[1] + ':' + params?.[2];
          const existing = _mockDb.get(key) || { count: 1, reset_at: new Date().toISOString() };
          _mockDb.set(key, { ...existing, count: params?.[0] as number });
        }
        return { rowCount: 1 };
      }
      if (text.includes('DELETE')) {
        _mockDb.clear();
        return { rowCount: 1 };
      }
      return { rows: [] };
    }),
  },
}));

describe('rate-limit module', () => {
  beforeEach(() => {
    _mockDb.clear();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('rateLimit', () => {
    it('returns null for first request in window', async () => {
      const { rateLimit } = await import('../rate-limit');
      const result = await rateLimit('1.2.3.4');
      expect(result).toBeNull();
    });

    it('returns null for requests under the limit', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 9; i++) {
        expect(await rateLimit('1.2.3.4')).toBeNull();
      }
    });

    it('returns 429 when exceeding the limit', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 10; i++) {
        await rateLimit('1.2.3.4');
      }
      const result = await rateLimit('1.2.3.4');
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
      const body = await result!.json();
      expect(body.error).toBe('Too many requests');
      expect(body.code).toBe('RATE_LIMITED');
    });

    it('uses separate windows for different IPs', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 10; i++) {
        await rateLimit('1.2.3.4');
      }
      expect(await rateLimit('1.2.3.4')).not.toBeNull();
      expect(await rateLimit('5.6.7.8')).toBeNull();
    });

    it('resets after window expires', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 11; i++) {
        await rateLimit('1.2.3.4');
      }
      expect(await rateLimit('1.2.3.4')).not.toBeNull();

      vi.advanceTimersByTime(60_001);

      expect(await rateLimit('1.2.3.4')).toBeNull();
    });

    it('accepts custom windowMs and max', async () => {
      const { rateLimit } = await import('../rate-limit');
      expect(await rateLimit('1.2.3.4', { windowMs: 1000, max: 1 })).toBeNull();
      const result = await rateLimit('1.2.3.4', { windowMs: 1000, max: 1 });
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });

    it('isolates different stores', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 11; i++) {
        await rateLimit('1.2.3.4', { store: 'login' });
      }
      expect(await rateLimit('1.2.3.4', { store: 'login' })).not.toBeNull();
      expect(await rateLimit('1.2.3.4', { store: 'api' })).toBeNull();
    });

    it('defaults store to _default', async () => {
      const { rateLimit } = await import('../rate-limit');
      expect(await rateLimit('1.2.3.4')).toBeNull();
      expect(await rateLimit('1.2.3.4', {})).toBeNull();
    });
  });

  describe('getClientIp', () => {
    it('returns x-forwarded-for first', async () => {
      const { getClientIp } = await import('../rate-limit');
      const req = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-real-ip': '9.9.9.9' },
      });
      expect(getClientIp(req)).toBe('1.2.3.4');
    });

    it('falls back to x-real-ip', async () => {
      const { getClientIp } = await import('../rate-limit');
      const req = new Request('http://localhost', {
        headers: { 'x-real-ip': '5.5.5.5' },
      });
      expect(getClientIp(req)).toBe('5.5.5.5');
    });

    it('returns unknown when no header', async () => {
      const { getClientIp } = await import('../rate-limit');
      const req = new Request('http://localhost');
      expect(getClientIp(req)).toBe('unknown');
    });

    it('trims x-forwarded-for values', async () => {
      const { getClientIp } = await import('../rate-limit');
      const req = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '  10.0.0.1  , 10.0.0.2' },
      });
      expect(getClientIp(req)).toBe('10.0.0.1');
    });

    it('trims x-real-ip value', async () => {
      const { getClientIp } = await import('../rate-limit');
      const req = new Request('http://localhost', {
        headers: { 'x-real-ip': '  10.0.0.1  ' },
      });
      expect(getClientIp(req)).toBe('10.0.0.1');
    });
  });
});
