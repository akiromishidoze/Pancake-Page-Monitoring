// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('lockout module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordFailedAttempt', () => {
    it('returns not locked for attempts below MAX_ATTEMPTS', async () => {
      const { recordFailedAttempt } = await import('../lockout');
      for (let i = 0; i < 4; i++) {
        const result = recordFailedAttempt('admin', '1.2.3.4');
        expect(result.locked).toBe(false);
        expect(result.remainingMs).toBe(0);
      }
    });

    it('locks account on 5th failed attempt', async () => {
      const { recordFailedAttempt, MAX_ATTEMPTS } = await import('../lockout');
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      const result = recordFailedAttempt('admin', '1.2.3.4');
      expect(result.locked).toBe(true);
      expect(result.remainingMs).toBe(5 * 60 * 1000);
    });

    it('separate identifiers have independent counters', async () => {
      const { recordFailedAttempt } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      expect(recordFailedAttempt('admin', '1.2.3.4').locked).toBe(true);
      expect(recordFailedAttempt('other', '1.2.3.4').locked).toBe(false);
      expect(recordFailedAttempt('other', '1.2.3.4').locked).toBe(false);
    });

    it('returns locked during entire lockout window', async () => {
      const { recordFailedAttempt, getLockoutStatus } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      expect(getLockoutStatus('admin').locked).toBe(true);

      // Advance almost to end of 5-minute lockout
      vi.advanceTimersByTime(4 * 60 * 1000 + 59_000);
      expect(getLockoutStatus('admin').locked).toBe(true);

      // Past the 5-minute mark
      vi.advanceTimersByTime(2_000);
      expect(getLockoutStatus('admin').locked).toBe(false);
    });
  });

  describe('resetAttempts', () => {
    it('clears lockout state', async () => {
      const { recordFailedAttempt, resetAttempts, getLockoutStatus } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      expect(getLockoutStatus('admin').locked).toBe(true);

      resetAttempts('admin');
      expect(getLockoutStatus('admin').locked).toBe(false);
      expect(getLockoutStatus('admin').attempts).toBe(0);
    });

    it('does not affect other identifiers', async () => {
      const { recordFailedAttempt, resetAttempts, getLockoutStatus } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      recordFailedAttempt('other', '5.6.7.8');

      resetAttempts('admin');
      expect(getLockoutStatus('admin').locked).toBe(false);
      expect(getLockoutStatus('other').locked).toBe(false);
    });
  });

  describe('getLockoutStatus', () => {
    it('returns unlocked for unknown identifier', async () => {
      const { getLockoutStatus } = await import('../lockout');
      const status = getLockoutStatus('unknown');
      expect(status.locked).toBe(false);
      expect(status.remainingMs).toBe(0);
      expect(status.attempts).toBe(0);
    });

    it('shows attempt count when not locked', async () => {
      const { recordFailedAttempt, getLockoutStatus } = await import('../lockout');
      recordFailedAttempt('admin', '1.2.3.4');
      recordFailedAttempt('admin', '1.2.3.4');

      const status = getLockoutStatus('admin');
      expect(status.locked).toBe(false);
      expect(status.attempts).toBe(2);
    });
  });

  describe('exponential backoff', () => {
    it('first lockout is 5 minutes', async () => {
      const { recordFailedAttempt } = await import('../lockout');
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      const r1 = recordFailedAttempt('admin', '1.2.3.4');
      expect(r1.remainingMs).toBe(5 * 60 * 1000);
    });

    it('second lockout is 15 minutes', async () => {
      const { recordFailedAttempt, resetAttempts, getLockoutStatus } = await import('../lockout');
      // First lockout cycle
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      expect(getLockoutStatus('admin').locked).toBe(true);

      // Wait for lockout to expire
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(getLockoutStatus('admin').locked).toBe(false);

      // Second lockout cycle — attempts should be 0 after lockout, need 5 more
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('admin', '1.2.3.4');
      }
      const r2 = recordFailedAttempt('admin', '1.2.3.4');
      expect(r2.locked).toBe(true);
      expect(r2.remainingMs).toBe(15 * 60 * 1000);
    });

    it('third lockout is 1 hour', async () => {
      const { recordFailedAttempt, getLockoutStatus } = await import('../lockout');
      // First lockout
      for (let i = 0; i < 5; i++) recordFailedAttempt('admin', '1.2.3.4');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Second lockout
      for (let i = 0; i < 5; i++) recordFailedAttempt('admin', '1.2.3.4');
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      // Third lockout
      for (let i = 0; i < 5; i++) recordFailedAttempt('admin', '1.2.3.4');
      const r3 = recordFailedAttempt('admin', '1.2.3.4');
      expect(r3.locked).toBe(true);
      expect(r3.remainingMs).toBe(60 * 60 * 1000);
    });

    it('caps at 24 hours for 5th+ lockout', async () => {
      const { recordFailedAttempt, getLockoutStatus } = await import('../lockout');
      // Cycle through 5 lockouts
      const durations = [5, 15, 60, 240, 1440]; // minutes
      for (let cycle = 0; cycle < 5; cycle++) {
        for (let i = 0; i < 5; i++) recordFailedAttempt('admin', '1.2.3.4');
        if (cycle < 4) vi.advanceTimersByTime(durations[cycle] * 60 * 1000 + 1);
      }
      const r5 = recordFailedAttempt('admin', '1.2.3.4');
      expect(r5.locked).toBe(true);
      expect(r5.remainingMs).toBe(24 * 60 * 60 * 1000);
    });
  });
});
