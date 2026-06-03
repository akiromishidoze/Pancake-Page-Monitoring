import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getSetting } from '@/lib/db';
import { sendAlert } from '@/lib/notify';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { requireApiAuth } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const rateLimited = rateLimit(getClientIp(req), { store: 'test-notification', max: 5 });
    if (rateLimited) return rateLimited;
    const webhook = await getSetting('notify_slack_webhook');
    if (!webhook) {
      return apiError(ErrorCodes.MISSING_FIELD, 'No Slack webhook configured', 400);
    }

    await sendAlert({
      title: '🔔 Test Notification',
      message: 'This is a test message from Page Monitor. If you see this, Slack notifications are working correctly.',
      level: 'info',
      platform: 'system',
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, message: 'Test notification sent' });
  } catch (e) {
    return apiCatch(e);
  }
}
