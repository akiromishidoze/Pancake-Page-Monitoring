// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('circuit-breaker module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shouldAttempt returns true for CLOSED circuit', async () => {
    const { shouldAttempt } = await import('@/lib/circuit-breaker');
    expect(shouldAttempt('test')).toBe(true);
  });

  it('recordSuccess resets failure count', async () => {
    const { shouldAttempt, recordFailure, recordSuccess, getBreakerState } = await import('@/lib/circuit-breaker');
    recordFailure('test');
    recordFailure('test');
    recordFailure('test');
    expect(getBreakerState('test')?.state).toBe('OPEN');
    recordSuccess('test');
    expect(getBreakerState('test')?.state).toBe('CLOSED');
    expect(getBreakerState('test')?.failureCount).toBe(0);
  });

  it('recordFailure opens circuit after threshold exceeded', async () => {
    const { recordFailure, getBreakerState, shouldAttempt } = await import('@/lib/circuit-breaker');
    expect(shouldAttempt('threshold')).toBe(true);
    recordFailure('threshold');
    expect(getBreakerState('threshold')?.state).toBe('CLOSED');
    recordFailure('threshold');
    expect(getBreakerState('threshold')?.state).toBe('CLOSED');
    // Third failure opens the circuit
    recordFailure('threshold');
    expect(getBreakerState('threshold')?.state).toBe('OPEN');
    expect(shouldAttempt('threshold')).toBe(false);
  });

  it('shouldAttempt returns false for OPEN circuit', async () => {
    const { shouldAttempt, recordFailure } = await import('@/lib/circuit-breaker');
    recordFailure('test');
    recordFailure('test');
    recordFailure('test');
    expect(shouldAttempt('test')).toBe(false);
  });

  it('shouldAttempt transitions OPEN → HALF_OPEN after cooldown', async () => {
    const { shouldAttempt, recordFailure, getBreakerState } = await import('@/lib/circuit-breaker');
    recordFailure('test');
    recordFailure('test');
    recordFailure('test');
    expect(getBreakerState('test')?.state).toBe('OPEN');

    // Advance past the 60s cooldown
    vi.advanceTimersByTime(61_000);

    // shouldAttempt should allow the attempt (HALF_OPEN)
    expect(shouldAttempt('test')).toBe(true);
    expect(getBreakerState('test')?.state).toBe('HALF_OPEN');
  });

  it('recordFailure on HALF_OPEN transitions back to OPEN', async () => {
    const { shouldAttempt, recordFailure, getBreakerState, recordSuccess } = await import('@/lib/circuit-breaker');
    // Open the circuit
    recordFailure('test');
    recordFailure('test');
    recordFailure('test');
    expect(getBreakerState('test')?.state).toBe('OPEN');

    // Advance past cooldown to enter HALF_OPEN
    vi.advanceTimersByTime(61_000);
    expect(shouldAttempt('test')).toBe(true);
    expect(getBreakerState('test')?.state).toBe('HALF_OPEN');

    // Half-open attempt fails
    recordFailure('test');
    expect(getBreakerState('test')?.state).toBe('OPEN');
    expect(shouldAttempt('test')).toBe(false);
  });

  it('recordSuccess on HALF_OPEN transitions to CLOSED', async () => {
    const { shouldAttempt, recordFailure, getBreakerState, recordSuccess: rs } = await import('@/lib/circuit-breaker');
    recordFailure('test');
    recordFailure('test');
    recordFailure('test');

    vi.advanceTimersByTime(61_000);
    expect(shouldAttempt('test')).toBe(true);
    expect(getBreakerState('test')?.state).toBe('HALF_OPEN');

    // Half-open attempt succeeds
    rs('test');
    expect(getBreakerState('test')?.state).toBe('CLOSED');
    expect(getBreakerState('test')?.failureCount).toBe(0);
  });

  it('only one concurrent half-open attempt is allowed', async () => {
    const { shouldAttempt, recordFailure } = await import('@/lib/circuit-breaker');
    recordFailure('test');
    recordFailure('test');
    recordFailure('test');

    vi.advanceTimersByTime(61_000);

    // First call transitions to HALF_OPEN and returns true
    expect(shouldAttempt('test')).toBe(true);
    // Second concurrent call is blocked
    expect(shouldAttempt('test')).toBe(false);
  });

  it('getBreakerState returns null for unknown key', async () => {
    const { getBreakerState } = await import('@/lib/circuit-breaker');
    expect(getBreakerState('unknown')).toBeNull();
  });

  it('resetBreaker removes the entry', async () => {
    const { recordFailure, getBreakerState, resetBreaker } = await import('@/lib/circuit-breaker');
    recordFailure('test');
    expect(getBreakerState('test')).not.toBeNull();
    resetBreaker('test');
    expect(getBreakerState('test')).toBeNull();
  });

  it('getAllBreakerStates returns all states', async () => {
    const { recordFailure, getAllBreakerStates } = await import('@/lib/circuit-breaker');
    recordFailure('a');
    recordFailure('a');
    recordFailure('a');
    recordFailure('b');
    recordFailure('b');
    const states = getAllBreakerStates();
    expect(states.a).toBeDefined();
    expect(states.b).toBeDefined();
  });
});
