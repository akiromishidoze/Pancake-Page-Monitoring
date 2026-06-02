import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getEndpointByApiKey, getLatestRun, isBotCakeEndpoint } from '@/lib/db';
import { refreshBotCake } from '@/lib/poller';
import { broadcastSSE } from '@/lib/sse';
import { cors, corsOptions } from '@/lib/cors';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

async function handler(apiKey: string | null, ip?: string) {
  if (ip) {
    const rateLimited = rateLimit(ip, { store: 'botcake-refresh', max: 5 });
    if (rateLimited) return rateLimited;
  }
  try {
    if (!apiKey) {
      return cors(apiError(ErrorCodes.AUTH_REQUIRED, 'Missing X-Api-Key header or ?key=', 401));
    }

    const endpoint = await getEndpointByApiKey(apiKey);
    if (!endpoint || !isBotCakeEndpoint(endpoint)) {
      return cors(apiError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Unauthorized', 401));
    }

    await refreshBotCake();
    broadcastSSE('refresh', JSON.stringify({ source: 'botcake-refresh', endpoint_id: endpoint.id }));

    const latest = await getLatestRun(endpoint.id);
    return cors(NextResponse.json({
      ok: true,
      run_id: latest?.run_id ?? null,
      pages: latest?.total_pages ?? 0,
      active: latest?.active_pages ?? 0,
      inactive: latest?.inactive_pages ?? 0,
      summary: latest?.raw_summary ? JSON.parse(latest.raw_summary) : null,
    }));
  } catch (e) {
    return cors(apiCatch(e));
  }
}

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-Api-Key');
  return handler(apiKey, getClientIp(req));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('key');
  return handler(apiKey, getClientIp(req));
}
