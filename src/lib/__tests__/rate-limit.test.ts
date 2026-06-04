// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('rate-limit module', () => {
  beforeEach(() => {
    vi.resetModules();
    // Mock setInterval so eviction timer doesn't interfere across tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rateLimit', () => {
    it('returns null for first request in window', async () => {
      const { rateLimit } = await import('../rate-limit');
      const result = rateLimit('1.2.3.4');
      expect(result).toBeNull();
    });

    it('returns null for requests under the limit', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 9; i++) {
        expect(rateLimit('1.2.3.4')).toBeNull();
      }
    });

    it('returns 429 when exceeding the limit', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 10; i++) {
        rateLimit('1.2.3.4');
      }
      const result = rateLimit('1.2.3.4');
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
      const body = await result!.json();
      expect(body.error).toBe('Too many requests');
      expect(body.code).toBe('RATE_LIMITED');
    });

    it('uses separate windows for different IPs', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 10; i++) {
        rateLimit('1.2.3.4');
      }
      expect(rateLimit('1.2.3.4')).not.toBeNull();
      expect(rateLimit('5.6.7.8')).toBeNull();
    });

    it('resets after window expires', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 11; i++) {
        rateLimit('1.2.3.4');
      }
      expect(rateLimit('1.2.3.4')).not.toBeNull();

      // Advance past window
      vi.advanceTimersByTime(60_001);

      // Should reset
      expect(rateLimit('1.2.3.4')).toBeNull();
    });

    it('accepts custom windowMs and max', async () => {
      const { rateLimit } = await import('../rate-limit');
      // 1 request per 1000ms
      expect(rateLimit('1.2.3.4', { windowMs: 1000, max: 1 })).toBeNull();
      const result = rateLimit('1.2.3.4', { windowMs: 1000, max: 1 });
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });

    it('isolates different stores', async () => {
      const { rateLimit } = await import('../rate-limit');
      for (let i = 0; i < 11; i++) {
        rateLimit('1.2.3.4', { store: 'login' });
      }
      // Exhausted in 'login' store
      expect(rateLimit('1.2.3.4', { store: 'login' })).not.toBeNull();
      // Separate store unaffected
      expect(rateLimit('1.2.3.4', { store: 'api' })).toBeNull();
    });

    it('defaults store to _default', async () => {
      const { rateLimit } = await import('../rate-limit');
      expect(rateLimit('1.2.3.4')).toBeNull();
      // Same unnamed store
      expect(rateLimit('1.2.3.4', {})).toBeNull();
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
