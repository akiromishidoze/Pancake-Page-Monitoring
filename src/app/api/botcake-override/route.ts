import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { setBotCakeOverride, removeBotCakeOverride } from '@/lib/db';
import { refreshAll } from '@/lib/poller';
import { cors, corsOptions } from '@/lib/cors';
import { BotCakeOverrideSchema } from '@/lib/schemas';

export async function POST(req: Request) {
  try {
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

    const body = parsed.data;
    if (body.remove) {
      await removeBotCakeOverride(body.page_id);
    } else {
      await setBotCakeOverride(body.page_id, body.is_active, body.reason ?? 'manual-override');
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
