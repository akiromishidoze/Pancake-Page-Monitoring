import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ErrorCodes } from '@/lib/errors';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicPaths = ['/api/login', '/api/health', '/login'];
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const session = request.cookies.get('session')?.value;
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_REQUIRED }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { validateSession } = await import('@/lib/auth');
  const valid = await validateSession(session);
  if (!valid) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'Not authenticated', code: ErrorCodes.AUTH_SESSION_EXPIRED }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { isStateChangingRequest, checkCsrf } = await import('@/lib/csrf');
  if (isStateChangingRequest(request.method) && !checkCsrf(request)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed', code: ErrorCodes.CSRF_FAILED }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
