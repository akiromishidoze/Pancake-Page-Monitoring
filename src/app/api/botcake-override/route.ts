import { NextResponse } from 'next/server';
import { setBotCakeOverride, removeBotCakeOverride } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';
import { refreshAll } from '@/lib/poller';
import { cors, corsOptions } from '@/lib/cors';

type Body = {
  page_id: string;
  is_active: boolean;
  reason?: string;
  remove?: boolean;
};

export async function POST(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  try {
    const body: Body = await req.json();
    if (!body.page_id) {
      return cors(NextResponse.json({ ok: false, error: 'Missing page_id' }, { status: 400 }));
    }

    if (body.remove) {
      removeBotCakeOverride(body.page_id);
    } else {
      setBotCakeOverride(body.page_id, body.is_active, body.reason ?? 'manual-override');
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
