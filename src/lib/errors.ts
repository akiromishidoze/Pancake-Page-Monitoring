import { NextResponse } from 'next/server';
import { createLogger } from './logger';

const log = createLogger('errors');

export const ErrorCodes = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_KEY_INVALID: 'AUTH_KEY_INVALID',
  AUTH_KEY_EXPIRED: 'AUTH_KEY_EXPIRED',
  AUTH_DEFAULT_CREDENTIALS: 'AUTH_DEFAULT_CREDENTIALS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  VALIDATION_INVALID_JSON: 'VALIDATION_INVALID_JSON',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  FORBIDDEN_IP: 'FORBIDDEN_IP',
  CSRF_FAILED: 'CSRF_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_VALUE: 'INVALID_VALUE',
} as const;

export type ErrorCode = string;

export function apiError(code: ErrorCode, message: string, status: number = 400, details?: unknown): NextResponse {
  const body: Record<string, unknown> = { ok: false, error: message, code };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

export function apiCatch(e: unknown, status: number = 500): NextResponse {
  const message = e instanceof Error ? e.message : String(e);
  const errInfo = e instanceof Error ? { err: e, stack: e.stack } : { err: String(e) };
  if (status >= 500) {
    log.error({ ...errInfo, status, code: ErrorCodes.INTERNAL_ERROR }, message);
  } else {
    log.warn({ ...errInfo, status, code: ErrorCodes.INTERNAL_ERROR }, message);
  }
  return NextResponse.json(
    { ok: false, error: message, code: ErrorCodes.INTERNAL_ERROR },
    { status },
  );
}
