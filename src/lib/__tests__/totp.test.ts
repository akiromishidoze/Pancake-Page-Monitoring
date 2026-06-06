// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('TOTP module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates a base32 secret of expected length', async () => {
    const { generateSecret } = await import('@/lib/totp');
    const secret = generateSecret(20);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it('generates a valid otpauth URI', async () => {
    const { generateSecret, generateTOTPUri } = await import('@/lib/totp');
    const secret = generateSecret();
    const uri = generateTOTPUri(secret, 'admin', 'TestApp');
    expect(uri).toContain('otpauth://totp/TestApp:admin?');
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('generates a 6-digit token', async () => {
    const { generateSecret, generateToken } = await import('@/lib/totp');
    const secret = generateSecret();
    const token = generateToken(secret);
    expect(token).toBeGreaterThanOrEqual(0);
    expect(token).toBeLessThan(1000000);
  });

  it('verifyTOTP accepts a valid code at the current time step', async () => {
    const { generateSecret, generateToken, verifyTOTP } = await import('@/lib/totp');
    const secret = generateSecret();
    // Freeze time to avoid edge of time-step issues
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const token = generateToken(secret);
    const code = String(token).padStart(6, '0');
    expect(verifyTOTP(code, secret)).toBe(true);
  });

  it('verifyTOTP rejects an incorrect code', async () => {
    const { generateSecret, verifyTOTP } = await import('@/lib/totp');
    const secret = generateSecret();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    expect(verifyTOTP('000000', secret)).toBe(false);
  });

  it('verifyTOTP accepts codes within ±1 time step window', async () => {
    const { generateSecret, generateToken, verifyTOTP } = await import('@/lib/totp');
    const secret = generateSecret();
    // Freeze at a specific time
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const centerToken = generateToken(secret);
    const centerCode = String(centerToken).padStart(6, '0');
    expect(verifyTOTP(centerCode, secret)).toBe(true);

    // Advance by 30s (one step forward)
    vi.setSystemTime(new Date('2025-06-15T12:00:30Z'));
    expect(verifyTOTP(centerCode, secret)).toBe(true);

    // Go back by 30s (one step back)
    vi.setSystemTime(new Date('2025-06-15T11:59:30Z'));
    expect(verifyTOTP(centerCode, secret)).toBe(true);

    // Advance by 2 steps (out of window)
    vi.setSystemTime(new Date('2025-06-15T12:01:00Z'));
    expect(verifyTOTP(centerCode, secret)).toBe(false);
  });

  it('verifyTOTP returns false for non-numeric input', async () => {
    const { generateSecret, verifyTOTP } = await import('@/lib/totp');
    const secret = generateSecret();
    expect(verifyTOTP('abcde', secret)).toBe(false);
  });

  it('generateToken is deterministic for the same secret and time', async () => {
    const { generateSecret, generateToken } = await import('@/lib/totp');
    const secret = generateSecret();
    vi.setSystemTime(new Date('2025-06-15T12:30:00Z'));
    const t1 = generateToken(secret);
    const t2 = generateToken(secret);
    expect(t1).toBe(t2);
  });

  it('different secrets produce different tokens at the same time', async () => {
    const { generateSecret, generateToken } = await import('@/lib/totp');
    const s1 = generateSecret();
    const s2 = generateSecret();
    vi.setSystemTime(new Date('2025-06-15T12:30:00Z'));
    const t1 = generateToken(s1);
    const t2 = generateToken(s2);
    expect(t1).not.toBe(t2);
  });
});

describe('TOTP temp token', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createTotpTempToken returns a token', async () => {
    const { createTotpTempToken } = await import('@/lib/totp');
    const token = createTotpTempToken('admin');
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('consumeTotpTempToken returns the identifier for valid token', async () => {
    const { createTotpTempToken, consumeTotpTempToken } = await import('@/lib/totp');
    const token = createTotpTempToken('admin');
    const id = consumeTotpTempToken(token);
    expect(id).toBe('admin');
  });

  it('consumeTotpTempToken returns null for unknown token', async () => {
    const { consumeTotpTempToken } = await import('@/lib/totp');
    const id = consumeTotpTempToken('nonexistent');
    expect(id).toBeNull();
  });

  it('consumeTotpTempToken returns null for expired token', async () => {
    const { createTotpTempToken, consumeTotpTempToken } = await import('@/lib/totp');
    const token = createTotpTempToken('admin');
    // Advance past 5-minute expiry
    vi.advanceTimersByTime(6 * 60 * 1000);
    const id = consumeTotpTempToken(token);
    expect(id).toBeNull();
  });

  it('consumeTotpTempToken only returns identifier once (single-use)', async () => {
    const { createTotpTempToken, consumeTotpTempToken } = await import('@/lib/totp');
    const token = createTotpTempToken('admin');
    expect(consumeTotpTempToken(token)).toBe('admin');
    expect(consumeTotpTempToken(token)).toBeNull();
  });
});
