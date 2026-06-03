import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRequest(headers: Record<string, string>): any {
  return {
    headers: {
      get: vi.fn((name: string) => headers[name.toLowerCase()] ?? null),
    },
  };
}

describe('csrf module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('isStateChangingRequest', () => {
    it('returns false for GET', async () => {
      const { isStateChangingRequest } = await import('../csrf');
      expect(isStateChangingRequest('GET')).toBe(false);
    });

    it('returns false for HEAD', async () => {
      const { isStateChangingRequest } = await import('../csrf');
      expect(isStateChangingRequest('HEAD')).toBe(false);
    });

    it('returns false for OPTIONS', async () => {
      const { isStateChangingRequest } = await import('../csrf');
      expect(isStateChangingRequest('OPTIONS')).toBe(false);
    });

    it('returns true for POST', async () => {
      const { isStateChangingRequest } = await import('../csrf');
      expect(isStateChangingRequest('POST')).toBe(true);
    });

    it('returns true for PUT', async () => {
      const { isStateChangingRequest } = await import('../csrf');
      expect(isStateChangingRequest('PUT')).toBe(true);
    });

    it('returns true for DELETE', async () => {
      const { isStateChangingRequest } = await import('../csrf');
      expect(isStateChangingRequest('DELETE')).toBe(true);
    });

    it('handles lowercase method', async () => {
      const { isStateChangingRequest } = await import('../csrf');
      expect(isStateChangingRequest('post')).toBe(true);
      expect(isStateChangingRequest('get')).toBe(false);
    });
  });

  describe('checkCsrf', () => {
    it('returns true when origin matches host', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({ origin: 'https://example.com', host: 'example.com' });
      expect(checkCsrf(req)).toBe(true);
    });

    it('returns false when origin does not match host', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({ origin: 'https://evil.com', host: 'example.com' });
      expect(checkCsrf(req)).toBe(false);
    });

    it('returns false when origin host differs by port', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({ origin: 'https://example.com:8080', host: 'example.com' });
      expect(checkCsrf(req)).toBe(false);
    });

    it('returns false when origin URL is invalid', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({ origin: 'not-a-url', host: 'example.com' });
      expect(checkCsrf(req)).toBe(false);
    });

    it('falls back to referer when origin is absent', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({ referer: 'https://example.com/page', host: 'example.com' });
      expect(checkCsrf(req)).toBe(true);
    });

    it('returns false when referer does not match host', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({ referer: 'https://evil.com/page', host: 'example.com' });
      expect(checkCsrf(req)).toBe(false);
    });

    it('returns false when referer URL is invalid', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({ referer: 'not-a-url', host: 'example.com' });
      expect(checkCsrf(req)).toBe(false);
    });

    it('returns false when both origin and referer are absent', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({});
      expect(checkCsrf(req)).toBe(false);
    });

    it('prefers origin over referer when both present', async () => {
      const { checkCsrf } = await import('../csrf');
      const req = createMockRequest({
        origin: 'https://example.com',
        referer: 'https://evil.com',
        host: 'example.com',
      });
      expect(checkCsrf(req)).toBe(true);
    });
  });
});
