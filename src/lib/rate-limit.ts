import { NextResponse } from 'next/server';
import { ErrorCodes } from './errors';

const _stores = new Map<string, Map<string, { count: number; resetAt: number }>>();

let _evictionTimer: ReturnType<typeof setInterval> | null = null;

function startEviction(): void {
  if (_evictionTimer) return;
  _evictionTimer = setInterval(() => {
    const now = Date.now();
    for (const [storeKey, store] of _stores) {
      for (const [ip, entry] of store) {
        if (now > entry.resetAt) store.delete(ip);
      }
      if (store.size === 0) _stores.delete(storeKey);
    }
  }, 60_000);
  _evictionTimer.unref();
}

startEviction();

export function rateLimit(
  ip: string,
  opts?: { windowMs?: number; max?: number; store?: string },
): NextResponse | null {
  const windowMs = opts?.windowMs ?? 60_000;
  const max = opts?.max ?? 10;
  const storeKey = opts?.store ?? '_default';

  if (!_stores.has(storeKey)) {
    _stores.set(storeKey, new Map());
  }
  const store = _stores.get(storeKey)!;

  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return null;
  }
  entry.count++;
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { ok: false, error: 'Too many requests', code: ErrorCodes.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  return null;
}

export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown';
}
