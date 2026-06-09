// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';

describe('cors module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  describe('cors', () => {
    it('returns no CORS headers when ALLOWED_ORIGINS is empty', async () => {
      delete process.env.ALLOWED_ORIGINS;
      const { cors } = await import('../cors');
      const res = cors(new NextResponse());
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Vary')).toBeNull();
    });

    it('returns no CORS headers when ALLOWED_ORIGINS is blank', async () => {
      process.env.ALLOWED_ORIGINS = '';
      const { cors } = await import('../cors');
      const res = cors(new NextResponse());
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('echoes matching origin', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';
      const { cors } = await import('../cors');
      const res = cors(new NextResponse(), 'https://app.example.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
      expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('falls back to first allowed origin for non-matching origin', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';
      const { cors } = await import('../cors');
      const res = cors(new NextResponse(), 'https://evil.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
      expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('sets Vary: Origin when CORS headers are present', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      const { cors } = await import('../cors');
      const res = cors(new NextResponse(), 'https://app.example.com');
      expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('sets standard CORS headers', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      const { cors } = await import('../cors');
      const res = cors(new NextResponse(), 'https://app.example.com');
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Api-Key');
    });

    it('trims whitespace in ALLOWED_ORIGINS', async () => {
      process.env.ALLOWED_ORIGINS = '  https://app.example.com  ,  https://admin.example.com  ';
      const { cors } = await import('../cors');
      const res = cors(new NextResponse(), 'https://app.example.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });
  });

  describe('corsReflectOrigin', () => {
    it('reflects matching origin', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      const { corsReflectOrigin } = await import('../cors');
      const res = corsReflectOrigin(new NextResponse(), 'https://app.example.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });

    it('returns no CORS headers for non-matching origin', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';
      const { corsReflectOrigin } = await import('../cors');
      const res = corsReflectOrigin(new NextResponse(), 'https://evil.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('returns no CORS headers when no allowed origins configured', async () => {
      delete process.env.ALLOWED_ORIGINS;
      const { corsReflectOrigin } = await import('../cors');
      const res = corsReflectOrigin(new NextResponse(), 'https://any.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does nothing when origin is null', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      const { corsReflectOrigin } = await import('../cors');
      const res = corsReflectOrigin(new NextResponse(), null);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('sets Vary header on allowed origin', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      const { corsReflectOrigin } = await import('../cors');
      const res = corsReflectOrigin(new NextResponse(), 'https://app.example.com');
      expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('returns no CORS headers when origin is unconfigured', async () => {
      delete process.env.ALLOWED_ORIGINS;
      const { corsReflectOrigin } = await import('../cors');
      const res = corsReflectOrigin(new NextResponse(), null);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();
    });
  });

  describe('corsOptions', () => {
    it('returns 204 response without CORS headers when unconfigured', async () => {
      process.env.ALLOWED_ORIGINS = '';
      const { corsOptions } = await import('../cors');
      const res = corsOptions();
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('passes origin to cors', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      const { corsOptions } = await import('../cors');
      const res = corsOptions('https://app.example.com');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });
  });
});
