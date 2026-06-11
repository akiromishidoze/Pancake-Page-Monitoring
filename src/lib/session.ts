/** Session cookie configuration with __Host- prefix for production hardening. */

const IS_PROD = process.env.NODE_ENV === 'production';

/** Cookie name: uses __Host- prefix in production for binding to origin + Secure + Path=/ */
export const SESSION_COOKIE_NAME = IS_PROD ? '__Host-session' : 'session';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true, // __Host- prefix requires Secure; always true for consistency
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};
