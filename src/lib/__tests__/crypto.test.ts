// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

describe('crypto module', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32chars!!';
  });

  afterEach(() => {
    if (ORIGINAL_KEY) {
      process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe('encrypt / decrypt', () => {
    it('encrypts and decrypts a string', async () => {
      const { encrypt, decrypt } = await import('../crypto');
      const plaintext = 'hello world';
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext each time (random IV)', async () => {
      const { encrypt } = await import('../crypto');
      const a = encrypt('same');
      const b = encrypt('same');
      expect(a).not.toBe(b);
    });

    it('handles empty string', async () => {
      const { encrypt, decrypt } = await import('../crypto');
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('handles special characters', async () => {
      const { encrypt, decrypt } = await import('../crypto');
      const special = 'héllo 🎉 world!\nnewline\tタブ';
      const encrypted = encrypt(special);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(special);
    });

    it('throws on invalid encrypted payload (wrong parts)', async () => {
      const { decrypt } = await import('../crypto');
      expect(() => decrypt('invalid')).toThrow('Invalid encrypted payload');
      expect(() => decrypt('a:b')).toThrow('Invalid encrypted payload');
    });

    it('throws on tampered ciphertext', async () => {
      const { encrypt, decrypt } = await import('../crypto');
      const encrypted = encrypt('secret');
      const [iv, authTag, ct] = encrypted.split(':');
      const tamperedAuth = `${iv}:${authTag.replace(/./, 'f')}:${ct}`;
      expect(() => decrypt(tamperedAuth)).toThrow();
    });
  });

  describe('getKey', () => {
    it('falls back to DATABASE_URL when ENCRYPTION_KEY is missing', async () => {
      delete process.env.ENCRYPTION_KEY;
      process.env['DATABASE_URL'] = 'postgres://user:pass@localhost/db';
      const { encrypt, decrypt } = await import('../crypto');
      const encrypted = encrypt('fallback test');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('fallback test');
      delete process.env['DATABASE_URL'];
    });

    it('throws when both ENCRYPTION_KEY and DATABASE_URL are missing', async () => {
      delete process.env.ENCRYPTION_KEY;
      delete process.env['DATABASE_URL'];
      const { encrypt } = await import('../crypto');
      expect(() => encrypt('test')).toThrow('cannot derive encryption key');
    });
  });
});
