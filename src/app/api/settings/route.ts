import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getSetting, setSetting, logAuditEntry } from '@/lib/db';
import { RetentionSettingsSchema } from '@/lib/schemas';
import { requireApiAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const retentionDays = (await getSetting('retention_days')) || '90';
    return NextResponse.json({
      ok: true,
      settings: { retention_days: retentionDays },
    });
  } catch (e) {
    return apiCatch(e);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = RetentionSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const { retention_days } = parsed.data;

    if (retention_days !== undefined) {
      const days = typeof retention_days === 'string' ? parseInt(retention_days, 10) : retention_days;
      if (isNaN(days) || days < 0) {
        return apiError(ErrorCodes.INVALID_VALUE, 'Invalid retention_days', 400);
      }
      await setSetting('retention_days', String(days));
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
      void logAuditEntry('update_retention', 'settings', 'retention_days', `Changed to ${days}`, ip);
    }

    return NextResponse.json({ ok: true, message: 'Settings updated' });
  } catch (e) {
    return apiCatch(e);
  }
}
