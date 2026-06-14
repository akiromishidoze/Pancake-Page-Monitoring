// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const _mockDb = new Map<string, Record<string, unknown>>();

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      if (text.includes('SELECT')) {
        const key = params?.[0] as string;
        const entry = _mockDb.get(key);
        if (entry) {
          return { rows: [entry] };
        }
        return { rows: [] };
      }
      if (text.includes('INSERT') || text.includes('UPDATE')) {
        if (text.startsWith('INSERT INTO lockout_entries')) {
          // INSERT INTO lockout_entries (identifier, attempts, first_attempt_at, last_ip) VALUES ($1, 1, NOW(), $2)
          _mockDb.set(params?.[0] as string, { attempts: 1, lockout_count: 0, lockout_until: new Date(0).toISOString(), last_ip: params?.[1] as string });
        } else if (text.includes('attempts = 0')) {
          // UPDATE lockout_entries SET attempts = 0, lockout_count = $1, lockout_until = $2, last_ip = $3 WHERE identifier = $4
          _mockDb.set(params?.[3] as string, { attempts: 0, lockout_count: params?.[0] as number, lockout_until: params?.[1] as string, last_ip: params?.[2] as string });
        } else if (text.includes('attempts = $1') && text.includes('lockout_entries')) {
          // UPDATE lockout_entries SET attempts = $1, last_ip = $2 WHERE identifier = $3
          const key = params?.[2] as string;
          const existing = _mockDb.get(key) as Record<string, unknown> || {};
          _mockDb.set(key, { ...existing, attempts: params?.[0] as number, last_ip: params?.[1] as string });
        } else if (text.includes('count = 1')) {
          // Rate limit reset
          _mockDb.set(params?.[0] + ':' + params?.[1], { count: 1, reset_at: params?.[2] as string });
        } else if (text.includes('count = $1')) {
          // Rate limit increment
          const existing = _mockDb.get(params?.[1] + ':' + params?.[2]) as Record<string, unknown> || {};
          _mockDb.set(params?.[1] + ':' + params?.[2], { ...existing, count: params?.[0] as number });
        }
        return { rowCount: 1 };
      }
      if (text.includes('DELETE')) {
        const key = params?.[0] as string;
        _mockDb.delete(key);
        return { rowCount: 1 };
      }
      return { rows: [] };
    }),
  },
}));

describe('lockout module', () => {
  beforeEach(() => {
    _mockDb.clear();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('recordFailedAttempt', () => {
    it('returns not locked for attempts below MAX_ATTEMPTS', async () => {
      const { recordFailedAttempt } = await import('../lockout');
      for (let i = 0; i < 4; i++) {
        const result = await recordFailedAttempt('admin', '1.2.3.4');
        expect(result.locked).toBe(false);
        expect(result.remainingMs).toBe(0);
      }
    });

    it('locks account on 5th failed attempt', async () => {
      const { recordFailedAttempt, MAX_ATTEMPTS } = await import('../lockout');
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      const result = await recordFailedAttempt('admin', '1.2.3.4');
      expect(result.locked).toBe(true);
      expect(result.remainingMs).toBe(5 * 60 * 1000);
    });

    it('separate identifiers have independent counters', async () => {
      const { recordFailedAttempt } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      expect((await recordFailedAttempt('admin', '1.2.3.4')).locked).toBe(true);
      expect((await recordFailedAttempt('other', '1.2.3.4')).locked).toBe(false);
      expect((await recordFailedAttempt('other', '1.2.3.4')).locked).toBe(false);
    });

    it('returns locked during entire lockout window', async () => {
      const { recordFailedAttempt, getLockoutStatus } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      expect((await getLockoutStatus('admin')).locked).toBe(true);

      // Advance almost to end of 5-minute lockout
      vi.advanceTimersByTime(4 * 60 * 1000 + 59_000);
      expect((await getLockoutStatus('admin')).locked).toBe(true);

      // Past the 5-minute mark
      vi.advanceTimersByTime(2_000);
      expect((await getLockoutStatus('admin')).locked).toBe(false);
    });
  });

  describe('resetAttempts', () => {
    it('clears lockout state', async () => {
      const { recordFailedAttempt, resetAttempts, getLockoutStatus } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      expect((await getLockoutStatus('admin')).locked).toBe(true);

      await resetAttempts('admin');
      expect((await getLockoutStatus('admin')).locked).toBe(false);
      expect((await getLockoutStatus('admin')).attempts).toBe(0);
    });

    it('does not affect other identifiers', async () => {
      const { recordFailedAttempt, resetAttempts, getLockoutStatus } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      await recordFailedAttempt('other', '5.6.7.8');

      await resetAttempts('admin');
      expect((await getLockoutStatus('admin')).locked).toBe(false);
      expect((await getLockoutStatus('other')).locked).toBe(false);
    });
  });

  describe('getLockoutStatus', () => {
    it('returns unlocked for unknown identifier', async () => {
      const { getLockoutStatus } = await import('../lockout');
      const status = await getLockoutStatus('unknown');
      expect(status.locked).toBe(false);
      expect(status.remainingMs).toBe(0);
      expect(status.attempts).toBe(0);
    });

    it('shows attempt count when not locked', async () => {
      const { recordFailedAttempt, getLockoutStatus } = await import('../lockout');
      await recordFailedAttempt('admin', '1.2.3.4');
      await recordFailedAttempt('admin', '1.2.3.4');

      const status = await getLockoutStatus('admin');
      expect(status.locked).toBe(false);
      expect(status.attempts).toBe(2);
    });
  });

  describe('exponential backoff', () => {
    it('first lockout is 5 minutes', async () => {
      const { recordFailedAttempt } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      const r1 = await recordFailedAttempt('admin', '1.2.3.4');
      expect(r1.remainingMs).toBe(5 * 60 * 1000);
    });

    it('second lockout is 15 minutes', async () => {
      const { recordFailedAttempt, getLockoutStatus } = await import('../lockout');
      // First lockout cycle
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      expect((await getLockoutStatus('admin')).locked).toBe(true);

      // Wait for lockout to expire
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect((await getLockoutStatus('admin')).locked).toBe(false);

      // Second lockout cycle — attempts should be 0 after lockout, need 5 more
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt('admin', '1.2.3.4');
      }
      const r2 = await recordFailedAttempt('admin', '1.2.3.4');
      expect(r2.locked).toBe(true);
      expect(r2.remainingMs).toBe(15 * 60 * 1000);
    });

    it('third lockout is 1 hour', async () => {
      const { recordFailedAttempt, getLockoutStatus: _getLockoutStatus } = await import('../lockout');
      // First lockout
      for (let i = 0; i < 5; i++) await recordFailedAttempt('admin', '1.2.3.4');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Second lockout
      for (let i = 0; i < 5; i++) await recordFailedAttempt('admin', '1.2.3.4');
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      // Third lockout
      for (let i = 0; i < 5; i++) await recordFailedAttempt('admin', '1.2.3.4');
      const r3 = await recordFailedAttempt('admin', '1.2.3.4');
      expect(r3.locked).toBe(true);
      expect(r3.remainingMs).toBe(60 * 60 * 1000);
    });

    it('permanently locks after 10 lockouts', async () => {
      const { recordFailedAttempt, getLockoutStatus, PERMANENT_LOCKOUT_THRESHOLD } = await import('../lockout');
      // 1st-9th lockout durations in minutes
      const durations = [5, 15, 60, 240, 1440, 1440, 1440, 1440, 1440];
      for (let cycle = 1; cycle < PERMANENT_LOCKOUT_THRESHOLD; cycle++) {
        for (let i = 0; i < 5; i++) await recordFailedAttempt('admin', '1.2.3.4');
        const status = await getLockoutStatus('admin');
        expect(status.locked).toBe(true);
        // Cycle 1-4 have escalating durations, 5-9 are 24h
        const expected = durations[cycle - 1] * 60 * 1000;
        expect(status.remainingMs).toBe(expected);
        vi.advanceTimersByTime(expected + 1);
        expect((await getLockoutStatus('admin')).locked).toBe(false);
      }
      // 10th lockout → permanent
      for (let i = 0; i < 5; i++) await recordFailedAttempt('admin', '1.2.3.4');
      const status = await getLockoutStatus('admin');
      expect(status.locked).toBe(true);
      expect(status.remainingMs).toBe(Infinity);
      // Even after advancing time, stays locked
      vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
      expect((await getLockoutStatus('admin')).locked).toBe(true);
      expect((await getLockoutStatus('admin')).remainingMs).toBe(Infinity);
    });

    it('resetAttempts unlocks permanently locked account', async () => {
      const { recordFailedAttempt, resetAttempts, getLockoutStatus, PERMANENT_LOCKOUT_THRESHOLD } = await import('../lockout');
      for (let cycle = 1; cycle < PERMANENT_LOCKOUT_THRESHOLD; cycle++) {
        for (let i = 0; i < 5; i++) await recordFailedAttempt('admin', '1.2.3.4');
        vi.advanceTimersByTime(1440 * 60 * 1000 + 1);
      }
      // 10th lockout → permanent
      for (let i = 0; i < 5; i++) await recordFailedAttempt('admin', '1.2.3.4');
      expect((await getLockoutStatus('admin')).locked).toBe(true);
      expect((await getLockoutStatus('admin')).remainingMs).toBe(Infinity);
      // Admin unlocks
      await resetAttempts('admin');
      expect((await getLockoutStatus('admin')).locked).toBe(false);
      expect((await getLockoutStatus('admin')).attempts).toBe(0);
    });
  });
});
