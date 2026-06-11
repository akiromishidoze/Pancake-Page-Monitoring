import { randomBytes } from 'crypto';

export const CSRF_COOKIE_NAME = 'csrf_token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isStateChangingRequest(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/** Generate a random CSRF token. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/** Build a Set-Cookie header value for the CSRF token cookie. */
export function makeCsrfCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Lax; HttpOnly=false${secure}; Max-Age=${60 * 60 * 24 * 7}`;
}

/** Verify X-CSRF-Token header matches the csrf_token cookie. */
function checkCsrfToken(request: Request): boolean {
  const headerToken = request.headers.get('x-csrf-token');
  if (!headerToken) return false;
  const cookieToken = request.headers.get('cookie')
    ?.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.slice(CSRF_COOKIE_NAME.length + 1);
  if (!cookieToken) return false;
  return headerToken === cookieToken;
}

/** Check Origin/Referer against Host header. */
function checkSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin) {
    try {
      const originUrl = new URL(origin);
      return originUrl.host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  // No Origin/Referer — not a browser request, can't be CSRF
  return true;
}

/** Returns true if the request passes CSRF validation.
 *  Checks double-submit cookie token first, then falls back to
 *  same-origin (Origin/Referer) validation. */
export function checkCsrf(request: Request): boolean {
  return checkCsrfToken(request) || checkSameOrigin(request);
}
