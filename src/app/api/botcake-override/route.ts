import { NextResponse } from 'next/server';
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
      return cors(NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }));
    }

    const parsed = BotCakeOverrideSchema.safeParse(raw);
    if (!parsed.success) {
      return cors(NextResponse.json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 }));
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
    return cors(NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    ));
  }
}

export async function OPTIONS() {
  return corsOptions();
}
