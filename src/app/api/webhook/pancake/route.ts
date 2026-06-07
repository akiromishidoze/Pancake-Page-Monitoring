import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { triggerPancakeRefresh } from '@/lib/poller';
import { createLogger } from '@/lib/logger';

const log = createLogger('webhook-pancake');

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

  let body: { shop_id?: number };
  try {
    body = await req.json();
  } catch {
    return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON body', 400);
  }

  void triggerPancakeRefresh().then(() => {
    log.info('pancake webhook processed for shop %s', body.shop_id ?? 'all');
  });

  return NextResponse.json({ ok: true, message: 'Pancake refresh triggered' });
}
