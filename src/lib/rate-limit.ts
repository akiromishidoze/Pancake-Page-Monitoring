import { NextResponse } from 'next/server';

const _stores = new Map<string, Map<string, { count: number; resetAt: number }>>();

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
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 });
  }
  return null;
}

export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown';
}
