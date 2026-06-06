import { randomBytes, createHmac } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;
const DIGITS = 6;

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return result;
}

function base32Decode(str: string): Buffer {
  const cleaned = str.replace(/[^A-Za-z2-7]/g, '').toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    buffer = (buffer << 5) | idx;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bytes.push((buffer >>> (bitsLeft - 8)) & 0xFF);
      bitsLeft -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hmacSha1(key: Buffer, counter: Buffer): Buffer {
  return createHmac('sha1', key).update(counter).digest();
}

function truncate(hs: Buffer): number {
  const offset = hs[hs.length - 1] & 0xf;
  const binary =
    ((hs[offset] & 0x7f) << 24) |
    ((hs[offset + 1] & 0xff) << 16) |
    ((hs[offset + 2] & 0xff) << 8) |
    (hs[offset + 3] & 0xff);
  return binary % Math.pow(10, DIGITS);
}

function getCounter(time: number = Date.now()): Buffer {
  const t = Math.floor(time / 1000 / STEP);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(t));
  return buf;
}

export function generateSecret(length: number = 20): string {
  const buf = randomBytes(length);
  return base32Encode(buf);
}

export function generateTOTPUri(secret: string, accountName: string, issuer: string = 'Page Monitor'): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params.toString()}`;
}

export function generateToken(secret: string, time: number = Date.now()): number {
  const key = base32Decode(secret);
  const counter = getCounter(time);
  const hs = hmacSha1(key, counter);
  return truncate(hs);
}

export function verifyTOTP(token: string, secret: string, time: number = Date.now()): boolean {
  const expected = parseInt(token, 10);
  if (isNaN(expected)) return false;

  for (let i = -1; i <= 1; i++) {
    const t = time + i * STEP * 1000;
    if (generateToken(secret, t) === expected) return true;
  }
  return false;
}

// ──── In-memory temp tokens for 2FA login step ────────────────────────

interface TotpTempToken {
  identifier: string;
  expiresAt: number;
}

const _tempTokens = new Map<string, TotpTempToken>();

const TEMP_TOKEN_TTL = 5 * 60 * 1000;

export function createTotpTempToken(identifier: string): string {
  const token = randomBytes(32).toString('hex');
  _tempTokens.set(token, { identifier, expiresAt: Date.now() + TEMP_TOKEN_TTL });
  return token;
}

export function consumeTotpTempToken(token: string): string | null {
  const entry = _tempTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _tempTokens.delete(token);
    return null;
  }
  _tempTokens.delete(token);
  return entry.identifier;
}
