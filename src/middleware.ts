import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ErrorCodes } from '@/lib/errors';
import crypto from 'crypto';

const publicPaths = ['/api/login', '/api/health', '/login'];

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function log(level: string, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const base = { ts, level, msg };
  const merged = meta ? { ...base, ...meta } : base;
  console.log(JSON.stringify(merged));
}

export async function middleware(request: NextRequest) {
  const start = Date.now();
  const requestId = crypto.randomBytes(8).toString('hex');
  const { pathname } = request.nextUrl;
  const method = request.method;
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') || '';

  log('info', 'request', {
    requestId, method, pathname, ip, ua,
  });

  const publicPath = publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (!publicPath) {
    const session = request.cookies.get('session')?.value;
    if (!session) {
      log('warn', 'auth: no session cookie', { requestId, pathname });
      if (pathname.startsWith('/api/')) {
        const res = NextResponse.json({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_REQUIRED }, { status: 401 });
        res.headers.set('x-request-id', requestId);
        return res;
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const { validateSession } = await import('@/lib/auth');
    const valid = await validateSession(session);
    if (!valid) {
      log('warn', 'auth: invalid session', { requestId, pathname });
      if (pathname.startsWith('/api/')) {
        const res = NextResponse.json({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_SESSION_EXPIRED }, { status: 401 });
        res.headers.set('x-request-id', requestId);
        return res;
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const { isStateChangingRequest, checkCsrf } = await import('@/lib/csrf');
    if (isStateChangingRequest(method) && !checkCsrf(request)) {
      log('warn', 'csrf: validation failed', { requestId, pathname, method });
      if (pathname.startsWith('/api/')) {
        const res = NextResponse.json({ ok: false, error: 'CSRF validation failed', code: ErrorCodes.CSRF_FAILED }, { status: 403 });
        res.headers.set('x-request-id', requestId);
        return res;
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);

  const duration = Date.now() - start;
  log('info', 'proxied', { requestId, method, pathname, durationMs: duration });

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
