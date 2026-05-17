import { NextResponse } from 'next/server';
import { getEndpointByApiKey, getLatestRun } from '@/lib/db';
import { refreshBotCake } from '@/lib/poller';
import { cors, corsOptions } from '@/lib/cors';

async function handler(apiKey: string | null) {
  if (!apiKey) {
    return cors(NextResponse.json({ ok: false, error: 'Missing X-Api-Key header or ?key=' }, { status: 401 }));
  }

  const endpoint = await getEndpointByApiKey(apiKey);
  if (!endpoint || endpoint.id !== 'botcake-platform') {
    return cors(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
  }

  await refreshBotCake();

  const latest = await getLatestRun('botcake-platform');
  return cors(NextResponse.json({
    ok: true,
    run_id: latest?.run_id ?? null,
    pages: latest?.total_pages ?? 0,
    active: latest?.active_pages ?? 0,
    inactive: latest?.inactive_pages ?? 0,
    summary: latest?.raw_summary ? JSON.parse(latest.raw_summary) : null,
  }));
}

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-Api-Key');
  return handler(apiKey);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('key');
  return handler(apiKey);
}
