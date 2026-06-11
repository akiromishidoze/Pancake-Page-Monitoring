import { CSRF_COOKIE_NAME } from './csrf';

/** Read the CSRF token from the cookie (set on login). */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? match[1] ?? null : null;
}

/** Attach CSRF headers to a request init object. */
export function withCsrf(init?: RequestInit): RequestInit {
  const token = getCsrfToken();
  if (!token) return init ?? {};
  return {
    ...init,
    headers: {
      ...init?.headers,
      'X-CSRF-Token': token,
    },
  };
}

/** Wrapper around fetch that automatically includes the CSRF token header. */
export async function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, withCsrf(init));
}
