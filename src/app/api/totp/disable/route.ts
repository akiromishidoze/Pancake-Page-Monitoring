import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { requireApiAuth, validateCredentials } from '@/lib/auth';
import { setSetting } from '@/lib/db';
import { TotpDisableSchema } from '@/lib/schemas';

export async function POST(req: Request) {
  try {
    const authErr = await requireApiAuth();
    if (authErr) return authErr;

    const ctErr = requireJson(req);
    if (ctErr) return ctErr;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = TotpDisableSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    if (!(await validateCredentials('admin', parsed.data.password))) {
      return apiError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid password', 401);
    }

    await setSetting('totp_enabled', 'false');
    await setSetting('totp_secret', '');

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiCatch(e);
  }
}
