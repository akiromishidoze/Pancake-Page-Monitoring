import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { triggerBotCakeRefresh } from '@/lib/poller';
import { createLogger } from '@/lib/logger';

const log = createLogger('webhook-botcake');

function secretValid(req: Request): boolean {
  const expected = process.env['WEBHOOK_SECRET'];
  if (!expected) return true;
  const got = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
  return got === expected;
}

export async function POST(req: Request) {
  if (!secretValid(req)) {
    return apiError(ErrorCodes.AUTH_REQUIRED, 'Invalid webhook secret', 401);
  }

  let body: { endpoint_id?: string };
  try {
    body = await req.json();
  } catch {
    return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON body', 400);
  }

  if (!body.endpoint_id) {
    return apiError(ErrorCodes.MISSING_FIELD, 'Missing endpoint_id', 400);
  }

  void triggerBotCakeRefresh(body.endpoint_id).then(ok => {
    log.info('botcake webhook processed for %s: %s', body.endpoint_id, ok ? 'ok' : 'failed');
  });

  return NextResponse.json({ ok: true, message: 'BotCake refresh triggered' });
}
