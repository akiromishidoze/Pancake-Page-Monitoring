import { pool } from './db';
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

function getLockoutDuration(lockoutCount: number): number {
  if (lockoutCount <= 0) return 0;
  const idx = Math.min(lockoutCount - 1, LOCKOUT_DURATIONS_MS.length - 1);
  return LOCKOUT_DURATIONS_MS[idx];
}

export async function recordFailedAttempt(identifier: string, ip: string): Promise<{ locked: boolean; remainingMs: number }> {
  const now = Date.now();

  try {
    const row = await pool.query<{
      attempts: number;
      lockout_count: number;
      lockout_until: string;
    }>(
      'SELECT attempts, lockout_count, lockout_until FROM lockout_entries WHERE identifier = $1',
      [identifier],
    );

    if (row.rows.length > 0) {
      const entry = row.rows[0];
      const lockoutUntil = new Date(entry.lockout_until).getTime();

      // If currently locked, reject without counting another attempt
      if (lockoutUntil > now) {
        return { locked: true, remainingMs: lockoutUntil - now };
      }

      const newAttempts = entry.attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        const newLockoutCount = entry.lockout_count + 1;
        const duration = getLockoutDuration(newLockoutCount);
        const lockoutUntilDate = new Date(now + duration);

        await pool.query(
          `UPDATE lockout_entries
           SET attempts = 0, lockout_count = $1, lockout_until = $2, last_ip = $3
           WHERE identifier = $4`,
          [newLockoutCount, lockoutUntilDate.toISOString(), ip, identifier],
        );

        log.warn({ identifier, ip, lockoutCount: newLockoutCount, durationMs: duration }, 'account locked due to too many failed login attempts');
        return { locked: true, remainingMs: duration };
      }

      await pool.query(
        'UPDATE lockout_entries SET attempts = $1, last_ip = $2 WHERE identifier = $3',
        [newAttempts, ip, identifier],
      );

      return { locked: false, remainingMs: 0 };
    }

    // First failed attempt — create entry
    await pool.query(
      `INSERT INTO lockout_entries (identifier, attempts, first_attempt_at, last_ip)
       VALUES ($1, 1, NOW(), $2)`,
      [identifier, ip],
    );

    return { locked: false, remainingMs: 0 };
  } catch (err) {
    log.error({ err }, 'DB lockout check failed — allowing attempt');
    return { locked: false, remainingMs: 0 };
  }
}

export async function resetAttempts(identifier: string): Promise<void> {
  try {
    await pool.query('DELETE FROM lockout_entries WHERE identifier = $1', [identifier]);
  } catch (err) {
    log.error({ err }, 'failed to reset lockout entry');
  }
}

export async function getLockoutStatus(identifier: string): Promise<{ locked: boolean; remainingMs: number; attempts: number }> {
  try {
    const row = await pool.query<{
      attempts: number;
      lockout_count: number;
      lockout_until: string;
    }>(
      'SELECT attempts, lockout_count, lockout_until FROM lockout_entries WHERE identifier = $1',
      [identifier],
    );

    if (row.rows.length === 0) return { locked: false, remainingMs: 0, attempts: 0 };

    const entry = row.rows[0];
    const lockoutUntil = new Date(entry.lockout_until).getTime();
    const now = Date.now();

    if (lockoutUntil > now) {
      return { locked: true, remainingMs: lockoutUntil - now, attempts: 0 };
    }

    return { locked: false, remainingMs: 0, attempts: entry.attempts };
  } catch (err) {
    log.error({ err }, 'failed to read lockout status');
    return { locked: false, remainingMs: 0, attempts: 0 };
  }
}
