// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('format module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('formatWithTz', () => {
    it('formats a Date object', async () => {
      const { formatWithTz } = await import('../format');
      const d = new Date('2024-01-15T12:30:00Z');
      const result = formatWithTz(d);
      expect(result).toContain('2024');
      expect(result).toContain('1/15/2024');
    });

    it('formats an ISO string', async () => {
      const { formatWithTz } = await import('../format');
      const result = formatWithTz('2024-06-01T00:00:00Z');
      expect(result).toContain('2024');
    });

    it('formats a timestamp number', async () => {
      const { formatWithTz } = await import('../format');
      const ts = new Date('2024-12-25T10:00:00Z').getTime();
      const result = formatWithTz(ts);
      expect(result).toContain('2024');
    });

    it('applies custom options', async () => {
      const { formatWithTz } = await import('../format');
      const d = new Date('2024-03-20T08:15:00Z');
      const result = formatWithTz(d, { hour: '2-digit', minute: '2-digit', hour12: false });
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('handles invalid date string gracefully', async () => {
      const { formatWithTz } = await import('../format');
      const result = formatWithTz('not-a-date');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatDateWithTz', () => {
    it('formats a Date object', async () => {
      const { formatDateWithTz } = await import('../format');
      const d = new Date('2024-07-04T00:00:00Z');
      const result = formatDateWithTz(d);
      expect(result).toContain('2024');
      expect(result).toContain('7/4/2024');
    });

    it('formats an ISO string', async () => {
      const { formatDateWithTz } = await import('../format');
      const result = formatDateWithTz('2024-11-15T00:00:00Z');
      expect(result).toContain('2024');
    });

    it('formats a timestamp number', async () => {
      const { formatDateWithTz } = await import('../format');
      const ts = new Date('2024-02-29T00:00:00Z').getTime();
      const result = formatDateWithTz(ts);
      expect(result).toContain('2024');
    });

    it('handles invalid date string', async () => {
      const { formatDateWithTz } = await import('../format');
      const result = formatDateWithTz('');
      expect(typeof result).toBe('string');
    });
  });
});
