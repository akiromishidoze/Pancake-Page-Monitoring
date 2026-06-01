import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getSetting } from '@/lib/db';
import { sendAlert } from '@/lib/notify';

export async function POST() {
  try {
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
