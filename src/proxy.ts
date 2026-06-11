import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ErrorCodes } from '@/lib/errors';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import { createLogger } from '@/lib/logger';

const log = createLogger('proxy');
const MAX_BODY_SIZE = 5 * 1024 * 1024;

const ROUTE_MAX_BODY: Record<string, number> = {
  '/api/ingest': 10 * 1024 * 1024,
  '/api/export': 10 * 1024 * 1024,
  '/api/backup': 10 * 1024 * 1024,
};

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function generateId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function proxy(request: NextRequest) {
  const start = Date.now();
  const requestId = generateId();
  const { pathname } = request.nextUrl;
  const method = request.method;
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || undefined;
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10) || undefined;
  const maxBodySize = ROUTE_MAX_BODY[pathname] ?? MAX_BODY_SIZE;

  log.info({ requestId, method, pathname, ip, userAgent, contentLength, maxBodySize }, 'request');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > maxBodySize) {
      log.warn({ requestId, pathname, method, contentLength, maxBodySize }, 'request body too large');
      return apiJson({ ok: false, error: 'Request body too large', code: ErrorCodes.PAYLOAD_TOO_LARGE }, 413);
    }
    if (contentLength === 0 && method !== 'DELETE') {
      log.warn({ requestId, pathname, method }, 'request body size unknown — no content-length header');
    }
  }

  function respond(res: NextResponse): NextResponse {
    res.headers.set('x-request-id', requestId);
    if (pathname.startsWith('/api/')) {
      if (method === 'GET') {
        res.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      } else {
        res.headers.set('Cache-Control', 'no-store');
      }
    }
    const responseSize = parseInt(res.headers.get('content-length') || '0', 10) || undefined;
    log.info({ requestId, method, pathname, status: res.status, durationMs: Date.now() - start, responseSize }, 'response');
    return res;
  }

  function apiJson(body: Record<string, unknown>, status: number): NextResponse {
    return respond(NextResponse.json(body, { status }));
  }

  if (method === 'OPTIONS') {
    return respond(NextResponse.next());
  }

  const publicPaths = ['/api/login', '/api/health', '/api/version', '/api/ingest', '/api/botcake-refresh', '/login'];
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return respond(NextResponse.next());
  }

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    log.warn({ requestId, pathname }, 'no session');
    if (pathname.startsWith('/api/')) {
      return apiJson({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_REQUIRED }, 401);
    }
    return respond(NextResponse.redirect(new URL('/login', request.url)));
  }

  const { validateSession } = await import('@/lib/auth');
  const valid = await validateSession(session);
  if (!valid) {
    log.warn({ requestId, pathname }, 'invalid session');
    if (pathname.startsWith('/api/')) {
      return apiJson({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_SESSION_EXPIRED }, 401);
    }
    return respond(NextResponse.redirect(new URL('/login', request.url)));
  }

  const { isStateChangingRequest, checkCsrf } = await import('@/lib/csrf');
  if (isStateChangingRequest(request.method) && !checkCsrf(request)) {
    log.warn({ requestId, pathname, method }, 'csrf failed');
    if (pathname.startsWith('/api/')) {
      return apiJson({ ok: false, error: 'CSRF validation failed', code: ErrorCodes.CSRF_FAILED }, 403);
    }
    return respond(NextResponse.redirect(new URL('/login', request.url)));
  }

  return respond(NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
