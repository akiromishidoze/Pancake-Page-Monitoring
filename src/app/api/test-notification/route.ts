import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { sendAlert } from '@/lib/notify';

export async function POST() {
  const webhook = getSetting('notify_slack_webhook');
  if (!webhook) {
    return NextResponse.json({ ok: false, error: 'No Slack webhook configured' }, { status: 400 });
  }

  await sendAlert({
    title: '🔔 Test Notification',
    message: 'This is a test message from Page Monitor. If you see this, Slack notifications are working correctly.',
    level: 'info',
    platform: 'system',
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, message: 'Test notification sent' });
}
