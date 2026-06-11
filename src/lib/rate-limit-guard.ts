import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from './rate-limit';

type TierConfig = { windowMs: number; max: number };

const TIERS: Record<string, TierConfig> = {
  read:    { windowMs: 60_000, max: 30 },
  write:   { windowMs: 60_000, max: 10 },
  delete:  { windowMs: 60_000, max: 6 },
  auth:    { windowMs: 60_000, max: 5 },
  heavy:   { windowMs: 60_000, max: 6 },
  export:  { windowMs: 60_000, max: 6 },
  webhook: { windowMs: 60_000, max: 30 },
};

const ROUTE_TIERS: Record<string, string | null> = {
  '/api/health':                    null,
  '/api/sse':                       null,
  '/api/version':                   null,
  '/api/change-password':           'auth',
  '/api/logout':                    'write',
  '/api/totp/disable':              'auth',
  '/api/totp/setup':                'auth',
  '/api/notify-settings':           'write',
  '/api/test-notification':         'heavy',
  '/api/test-email-notification':   'heavy',
  '/api/check-alerts':              'heavy',
  '/api/botcake-override':          'write',
  '/api/botcake-export':            'export',
  '/api/backfill':                  'heavy',
  '/api/audit-log':                 'read',
  '/api/last-run':                  'read',
  '/api/export':                    'export',
  '/api/pages/export':              'export',
  '/api/webhook/pancake':           'webhook',
  '/api/webhook/botcake':           'webhook',
};

function matchRoute(path: string): string {
  const segments = path.split('/');
  if (segments.length >= 4 && segments[1] === 'api') {
    const base = `/${segments.slice(1, 4).join('/')}`;
    if (['endpoints', 'platform-pages', 'connectors', 'users', 'notifications'].includes(segments[3])) {
      return base;
    }
  }
  if (segments.length >= 5 && path.startsWith('/api/pages/') && path.endsWith('/export')) {
    return '/api/pages/export';
  }
  return path;
}

export async function rateLimitRoute(req: Request | undefined): Promise<NextResponse | null> {
  if (!req) return null;
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const matched = matchRoute(path);

  const tierName = ROUTE_TIERS[path] ?? ROUTE_TIERS[matched];
  if (tierName === null) return null;
  if (tierName) {
    const config = TIERS[tierName];
    if (!config) return null;
    return rateLimit(getClientIp(req), { ...config, store: `route:${matched}` });
  }

  const defaults: Record<string, string> = {
    GET:    'read',
    POST:   'write',
    PUT:    'write',
    PATCH:  'write',
    DELETE: 'delete',
  };

  const defaultTier = defaults[method];
  if (!defaultTier) return null;

  const config = TIERS[defaultTier];
  return rateLimit(getClientIp(req), { ...config, store: `route:${matched}` });
}
