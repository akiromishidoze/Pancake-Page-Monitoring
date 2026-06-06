import { createLogger } from './logger';
import { addNotification } from './notifications';

const log = createLogger('circuit-breaker');

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerEntry {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  threshold: number;
  cooldownMs: number;
}

const _breakers = new Map<string, BreakerEntry>();
const _halfOpenInflight = new Set<string>();

const DEFAULT_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 60_000;

function getEntry(key: string, threshold = DEFAULT_THRESHOLD, cooldownMs = DEFAULT_COOLDOWN_MS): BreakerEntry {
  let entry = _breakers.get(key);
  if (!entry) {
    entry = { state: 'CLOSED', failureCount: 0, lastFailureTime: 0, threshold, cooldownMs };
    _breakers.set(key, entry);
  }
  return entry;
}

export function shouldAttempt(key: string, threshold?: number, cooldownMs?: number): boolean {
  const entry = getEntry(key, threshold, cooldownMs);
  if (entry.state === 'CLOSED') return true;

  const now = Date.now();
  if (entry.state === 'OPEN') {
    if (now - entry.lastFailureTime >= entry.cooldownMs && !_halfOpenInflight.has(key)) {
      entry.state = 'HALF_OPEN';
      _halfOpenInflight.add(key);
      log.info('circuit %s → HALF_OPEN (cooldown expired)', key);
      void addNotification('info', 'info', `Circuit Half-Open: ${key}`, `Circuit breaker for "${key}" transitioned to HALF_OPEN after cooldown. Next attempt will determine recovery.`);
      return true;
    }
    return false;
  }

  // HALF_OPEN: reject concurrent attempts while one is in-flight
  return false;
}

export function recordSuccess(key: string): void {
  _halfOpenInflight.delete(key);
  const entry = _breakers.get(key);
  if (!entry) return;
  if (entry.state !== 'CLOSED') {
    const prev = entry.state;
    log.info('circuit %s %s → CLOSED (recovered)', key, prev);
    void addNotification('info', 'info', `Circuit Closed: ${key}`, `Circuit breaker for "${key}" recovered and is now CLOSED.`);
  }
  entry.state = 'CLOSED';
  entry.failureCount = 0;
  entry.lastFailureTime = 0;
}

export function recordFailure(key: string, threshold?: number): boolean {
  _halfOpenInflight.delete(key);
  const entry = getEntry(key, threshold);
  entry.failureCount++;
  entry.lastFailureTime = Date.now();

  if (entry.failureCount >= (threshold ?? entry.threshold)) {
    const wasAlreadyOpen = entry.state === 'OPEN';
    entry.state = 'OPEN';
    if (!wasAlreadyOpen) {
      log.warn('circuit %s → OPEN (%d consecutive failures)', key, entry.failureCount);
      void addNotification('external_error', 'warning', `Circuit Open: ${key}`, `Circuit breaker for "${key}" opened after ${entry.failureCount} consecutive failures. Skipping until cooldown expires.`);
    } else {
      log.warn('circuit %s remains OPEN (%d consecutive failures)', key, entry.failureCount);
    }
    return true;
  }

  if (entry.state === 'HALF_OPEN') {
    entry.state = 'OPEN';
    log.warn('circuit %s HALF_OPEN → OPEN (test attempt failed)', key);
    void addNotification('external_error', 'warning', `Circuit Re-Open: ${key}`, `Circuit breaker for "${key}" re-opened after half-open test attempt failed.`);
  }

  return false;
}

export function getBreakerState(key: string): { state: CircuitState; failureCount: number; lastFailureTime: number; threshold: number; cooldownMs: number } | null {
  const entry = _breakers.get(key);
  if (!entry) return null;
  return { state: entry.state, failureCount: entry.failureCount, lastFailureTime: entry.lastFailureTime, threshold: entry.threshold, cooldownMs: entry.cooldownMs };
}

export function resetBreaker(key: string): void {
  _halfOpenInflight.delete(key);
  _breakers.delete(key);
}

export function getAllBreakerStates(): Record<string, { state: CircuitState; failureCount: number; lastFailureTime: number }> {
  const result: Record<string, { state: CircuitState; failureCount: number; lastFailureTime: number }> = {};
  for (const [key, entry] of _breakers) {
    result[key] = { state: entry.state, failureCount: entry.failureCount, lastFailureTime: entry.lastFailureTime };
  }
  return result;
}
