import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { requireApiAuth } from '@/lib/auth';
import { generateSecret, generateTOTPUri, verifyTOTP } from '@/lib/totp';
import { getSetting, setSetting, logAuditEntry } from '@/lib/db';
import { TotpSetupSchema } from '@/lib/schemas';
import { getClientIp } from '@/lib/rate-limit';
import { rateLimitRoute } from '@/lib/rate-limit-guard';
import QRCode from 'qrcode';

let _pendingSecret: string | null = null;

export async function GET(req: Request) {
  try {
    const authErr = await requireApiAuth();
    if (authErr) return authErr;
    const rl = await rateLimitRoute(req); if (rl) return rl;

    const secret = generateSecret();
    _pendingSecret = secret;
    const uri = generateTOTPUri(secret, 'admin');
    const qrDataUrl = await QRCode.toDataURL(uri);

    return NextResponse.json({ ok: true, secret, uri, qr: qrDataUrl });
  } catch (e) {
    return apiCatch(e);
  }
}

export async function POST(req: Request) {
  try {
    const authErr = await requireApiAuth();
    if (authErr) return authErr;
    const rl = await rateLimitRoute(req); if (rl) return rl;

    const ctErr = requireJson(req);
    if (ctErr) return ctErr;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = TotpSetupSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const secret = _pendingSecret || (await getSetting('totp_secret'));
    if (!secret) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'No pending TOTP setup. Call GET first.', 400);
    }

    if (!verifyTOTP(parsed.data.code, secret)) {
      return apiError(ErrorCodes.AUTH_TOTP_INVALID, 'Invalid code', 400);
    }

    await setSetting('totp_secret', secret);
    await setSetting('totp_enabled', 'true');
    _pendingSecret = null;

    const ip = getClientIp(req);
    void logAuditEntry('enable_totp', 'auth', 'totp', 'TOTP two-factor authentication enabled', ip);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiCatch(e);
  }
}
