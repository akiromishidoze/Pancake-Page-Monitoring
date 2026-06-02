import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ErrorCodes } from '@/lib/errors';

const MAX_BODY_SIZE = 5 * 1024 * 1024;

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

function logReq(level: string, msg: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));
}

export async function proxy(request: NextRequest) {
  const start = Date.now();
  const requestId = generateId();
  const { pathname } = request.nextUrl;
  const method = request.method;
  const ip = getClientIp(request);

  logReq('info', 'request', { requestId, method, pathname, ip });

  if (method === 'POST' || method === 'PUT') {
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      logReq('warn', 'request body too large', { requestId, pathname, contentLength, maxSize: MAX_BODY_SIZE });
      if (pathname.startsWith('/api/')) {
        return apiJson({ ok: false, error: 'Request body too large', code: ErrorCodes.PAYLOAD_TOO_LARGE }, 413);
      }
      return new NextResponse('Request body too large', { status: 413 });
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
    logReq('info', 'response', { requestId, method, pathname, status: res.status, durationMs: Date.now() - start });
    return res;
  }

  function apiJson(body: Record<string, unknown>, status: number): NextResponse {
    return respond(NextResponse.json(body, { status }));
  }

  const publicPaths = ['/api/login', '/api/health', '/login'];
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return respond(NextResponse.next());
  }

  const session = request.cookies.get('session')?.value;
  if (!session) {
    logReq('warn', 'no session', { requestId, pathname });
    if (pathname.startsWith('/api/')) {
      return apiJson({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_REQUIRED }, 401);
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { validateSession } = await import('@/lib/auth');
  const valid = await validateSession(session);
  if (!valid) {
    logReq('warn', 'invalid session', { requestId, pathname });
    if (pathname.startsWith('/api/')) {
      return apiJson({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_SESSION_EXPIRED }, 401);
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { isStateChangingRequest, checkCsrf } = await import('@/lib/csrf');
  if (isStateChangingRequest(request.method) && !checkCsrf(request)) {
    logReq('warn', 'csrf failed', { requestId, pathname, method });
    if (pathname.startsWith('/api/')) {
      return apiJson({ ok: false, error: 'CSRF validation failed', code: ErrorCodes.CSRF_FAILED }, 403);
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return respond(NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
