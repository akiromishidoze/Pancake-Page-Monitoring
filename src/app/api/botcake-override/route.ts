import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch, requireJson } from '@/lib/errors';
import { setBotCakeOverride, removeBotCakeOverride, logAuditEntry } from '@/lib/db';
import { refreshAll } from '@/lib/poller';
import { cors, corsOptions } from '@/lib/cors';
import { BotCakeOverrideSchema } from '@/lib/schemas';
import { requireApiAuth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return cors(auth);
    const ctErr = requireJson(req);
    if (ctErr) return cors(ctErr);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return cors(apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400));
    }

    const parsed = BotCakeOverrideSchema.safeParse(raw);
    if (!parsed.success) {
      return cors(apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten()));
    }

    const ip = getClientIp(req);
    const rateLimited = await rateLimit(ip, { store: 'botcake-override', max: 10 });
    if (rateLimited) return cors(rateLimited);
    const body = parsed.data;
    if (body.remove) {
      await removeBotCakeOverride(body.page_id);
      void logAuditEntry('remove_botcake_override', 'botcake_override', body.page_id, `Removed override for page ${body.page_id}`, ip);
    } else {
      await setBotCakeOverride(body.page_id, body.is_active, body.reason ?? 'manual-override');
      void logAuditEntry('set_botcake_override', 'botcake_override', body.page_id, `Set override for page ${body.page_id}: active=${body.is_active}`, ip);
    }

    await refreshAll();

    return cors(NextResponse.json({ ok: true }));
  } catch (e) {
    return cors(apiCatch(e));
  }
}

export async function OPTIONS() {
  return corsOptions();
}
