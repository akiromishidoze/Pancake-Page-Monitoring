import { NextResponse } from 'next/server';
import { ErrorCodes, apiError } from '@/lib/errors';
import { WebhookPancakeSchema } from '@/lib/schemas';
import { triggerPancakeRefresh } from '@/lib/poller';
import { createLogger } from '@/lib/logger';

const log = createLogger('webhook-pancake');

function secretValid(req: Request): boolean {
  const expected = process.env['WEBHOOK_SECRET'];
  if (!expected) return false;
  const got = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
  return got === expected;
}

export async function POST(req: Request) {
  if (!secretValid(req)) {
    return apiError(ErrorCodes.AUTH_REQUIRED, 'Invalid webhook secret', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON body', 400);
  }

  const parsed = WebhookPancakeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
  }

  void triggerPancakeRefresh().then(() => {
    log.info('pancake webhook processed for shop %s', parsed.data.shop_id ?? 'all');
  });

  return NextResponse.json({ ok: true, message: 'Pancake refresh triggered' });
}
