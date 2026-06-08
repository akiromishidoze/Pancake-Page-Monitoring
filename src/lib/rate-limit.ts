import { NextResponse } from 'next/server';
import { ErrorCodes } from './errors';
import { pool } from './db';

const _stores = new Map<string, Map<string, { count: number; resetAt: number }>>();

let _evictionTimer: ReturnType<typeof setInterval> | null = null;

function startEviction(): void {
  if (_evictionTimer) return;
  _evictionTimer = setInterval(async () => {
    const now = Date.now();
    for (const [storeKey, store] of _stores) {
      for (const [ip, entry] of store) {
        if (now > entry.resetAt) store.delete(ip);
      }
      if (store.size === 0) _stores.delete(storeKey);
    }
    try {
      await pool.query('DELETE FROM rate_limit_entries WHERE reset_at < NOW()');
    } catch {
      // best-effort cleanup
    }
  }, 60_000);
  _evictionTimer.unref();
}

startEviction();

export async function rateLimit(
  ip: string,
  opts?: { windowMs?: number; max?: number; store?: string },
): Promise<NextResponse | null> {
  const windowMs = opts?.windowMs ?? 60_000;
  const max = opts?.max ?? 10;
  const storeKey = opts?.store ?? '_default';

  const now = Date.now();

  // Fast in-memory check first
  if (!_stores.has(storeKey)) {
    _stores.set(storeKey, new Map());
  }
  const store = _stores.get(storeKey)!;
  const memEntry = store.get(ip);
  if (memEntry && now <= memEntry.resetAt) {
    memEntry.count++;
    if (memEntry.count > max) {
      const retryAfter = Math.ceil((memEntry.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { ok: false, error: 'Too many requests', code: ErrorCodes.RATE_LIMITED },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
    return null;
  }

  // Sync from DB on first request in window or after expiry
  try {
    const row = await pool.query<{ count: number; reset_at: string }>(
      'SELECT count, reset_at FROM rate_limit_entries WHERE store_key = $1 AND identifier = $2',
      [storeKey, ip],
    );

    if (row.rows.length > 0) {
      const dbResetAt = new Date(row.rows[0].reset_at).getTime();
      if (now <= dbResetAt) {
        const dbCount = row.rows[0].count + 1;
        await pool.query(
          'UPDATE rate_limit_entries SET count = $1 WHERE store_key = $2 AND identifier = $3',
          [dbCount, storeKey, ip],
        );
        store.set(ip, { count: dbCount, resetAt: dbResetAt });
        if (dbCount > max) {
          const retryAfter = Math.ceil((dbResetAt - Date.now()) / 1000);
          return NextResponse.json(
            { ok: false, error: 'Too many requests', code: ErrorCodes.RATE_LIMITED },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }
        return null;
      }
    }
  } catch {
    // DB unavailable — fall back to in-memory only
  }

  // Start new window
  const resetAt = now + windowMs;
  store.set(ip, { count: 1, resetAt });
  try {
    await pool.query(
      `INSERT INTO rate_limit_entries (store_key, identifier, count, reset_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (store_key, identifier) DO UPDATE SET count = 1, reset_at = $3`,
      [storeKey, ip, new Date(resetAt).toISOString()],
    );
  } catch {
    // best-effort
  }
  return null;
}

export function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown';
}
