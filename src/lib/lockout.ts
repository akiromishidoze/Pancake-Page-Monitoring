import { createLogger } from './logger';

const log = createLogger('lockout');

export const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATIONS_MS = [
  5 * 60 * 1000,      // 1st lockout: 5 minutes
  15 * 60 * 1000,     // 2nd lockout: 15 minutes
  60 * 60 * 1000,     // 3rd lockout: 1 hour
  4 * 60 * 60 * 1000, // 4th lockout: 4 hours
  24 * 60 * 60 * 1000,// 5th+ lockout: 24 hours
];

type LockoutEntry = {
  attempts: number;
  firstAttemptAt: number;
  lockoutCount: number;
  lockoutUntil: number;
  lastIp: string;
};

const _store = new Map<string, LockoutEntry>();

let _evictionTimer: ReturnType<typeof setInterval> | null = null;

function startEviction(): void {
  if (_evictionTimer) return;
  _evictionTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _store) {
      if (now > entry.lockoutUntil && entry.attempts === 0) {
        _store.delete(key);
      }
    }
  }, 60_000);
  _evictionTimer.unref();
}

startEviction();

function getLockoutDuration(lockoutCount: number): number {
  if (lockoutCount <= 0) return 0;
  const idx = Math.min(lockoutCount - 1, LOCKOUT_DURATIONS_MS.length - 1);
  return LOCKOUT_DURATIONS_MS[idx];
}

export function recordFailedAttempt(identifier: string, ip: string): { locked: boolean; remainingMs: number } {
  const now = Date.now();
  let entry = _store.get(identifier);

  if (!entry) {
    entry = { attempts: 0, firstAttemptAt: now, lockoutCount: 0, lockoutUntil: 0, lastIp: ip };
    _store.set(identifier, entry);
  }

  // If currently locked, reject without counting another attempt
  if (entry.lockoutUntil > now) {
    return { locked: true, remainingMs: entry.lockoutUntil - now };
  }

  entry.attempts++;
  entry.lastIp = ip;

  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockoutCount++;
    const duration = getLockoutDuration(entry.lockoutCount);
    entry.lockoutUntil = now + duration;
    entry.attempts = 0;

    log.warn({ identifier, ip, lockoutCount: entry.lockoutCount, durationMs: duration }, 'account locked due to too many failed login attempts');

    return { locked: true, remainingMs: duration };
  }

  return { locked: false, remainingMs: 0 };
}

export function resetAttempts(identifier: string): void {
  _store.delete(identifier);
}

export function getLockoutStatus(identifier: string): { locked: boolean; remainingMs: number; attempts: number } {
  const entry = _store.get(identifier);
  if (!entry) return { locked: false, remainingMs: 0, attempts: 0 };

  const now = Date.now();

  if (entry.lockoutUntil > now) {
    return { locked: true, remainingMs: entry.lockoutUntil - now, attempts: 0 };
  }

  return { locked: false, remainingMs: 0, attempts: entry.attempts };
}
