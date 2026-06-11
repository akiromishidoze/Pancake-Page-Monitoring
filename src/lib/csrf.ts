const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isStateChangingRequest(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/** Returns true if the request passes CSRF validation.
 *  - If Origin is present, it must match Host.
 *  - If only Referer is present, it must match Host.
 *  - If neither is present (non-browser client), pass through. */
export function checkCsrf(request: Request): boolean {
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
