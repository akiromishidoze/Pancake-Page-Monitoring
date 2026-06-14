import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { getSetting, setSetting, logAuditEntry } from '@/lib/db';
import { RetentionSettingsSchema } from '@/lib/schemas';
import { withAuth } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guard';
import { withCache } from '@/lib/api-cache';

export const GET = withAuth(withCache(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
  const retentionDays = (await getSetting('retention_days')) || '90';
  return NextResponse.json({
    ok: true,
    settings: { retention_days: retentionDays },
  });
}));

export const POST = withAuth(async (req: Request) => {
    const rl = await rateLimitRoute(req); if (rl) return rl;
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
});
