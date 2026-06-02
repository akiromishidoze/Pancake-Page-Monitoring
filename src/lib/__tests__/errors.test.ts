import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('errors module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('ErrorCodes', () => {
    it('exports expected error codes', async () => {
      const { ErrorCodes } = await import('../errors');
      expect(ErrorCodes.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(Object.keys(ErrorCodes).length).toBeGreaterThan(10);
    });
  });

  describe('apiError', () => {
    it('returns response with given status', async () => {
      const { apiError } = await import('../errors');
      const res = apiError('NOT_FOUND', 'Resource not found', 404);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Resource not found');
      expect(body.code).toBe('NOT_FOUND');
    });

    it('defaults to status 400', async () => {
      const { apiError } = await import('../errors');
      const res = apiError('VALIDATION_ERROR', 'Bad input');
      expect(res.status).toBe(400);
    });

    it('includes details when provided', async () => {
      const { apiError } = await import('../errors');
      const details = { field: 'email', reason: 'required' };
      const res = apiError('MISSING_FIELD', 'Field missing', 422, details);
      const body = await res.json();
      expect(body.details).toEqual(details);
    });

    it('omits details when undefined', async () => {
      const { apiError } = await import('../errors');
      const res = apiError('INTERNAL_ERROR', 'Oops', 500);
      const body = await res.json();
      expect(body.details).toBeUndefined();
    });

    it('handles 401 status', async () => {
      const { apiError } = await import('../errors');
      const res = apiError('AUTH_REQUIRED', 'Login required', 401);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('AUTH_REQUIRED');
    });

    it('handles 403 status', async () => {
      const { apiError } = await import('../errors');
      const res = apiError('FORBIDDEN', 'Access denied', 403);
      expect(res.status).toBe(403);
    });

    it('handles 429 status', async () => {
      const { apiError } = await import('../errors');
      const res = apiError('RATE_LIMITED', 'Too many requests', 429);
      expect(res.status).toBe(429);
    });
  });

  describe('apiCatch', () => {
    it('returns error message from Error object', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch(new Error('Database connection failed'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Database connection failed');
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('returns 500 by default', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch(new Error('fail'));
      expect(res.status).toBe(500);
    });

    it('accepts custom status code', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch(new Error('fail'), 502);
      expect(res.status).toBe(502);
    });

    it('handles string error', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch('something broke');
      const body = await res.json();
      expect(body.error).toBe('something broke');
    });

    it('handles numeric error', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch(42);
      const body = await res.json();
      expect(body.error).toBe('42');
    });

    it('handles null error', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch(null);
      const body = await res.json();
      expect(body.error).toBe('null');
    });

    it('handles object error', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch({ foo: 'bar' });
      const body = await res.json();
      expect(body.error).toBe('[object Object]');
    });

    it('handles undefined error', async () => {
      const { apiCatch } = await import('../errors');
      const res = apiCatch(undefined);
      const body = await res.json();
      expect(body.error).toBe('undefined');
    });
  });
});
