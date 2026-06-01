import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { sendAlert } from '@/lib/notify';

export async function POST() {
  try {

    await sendAlert({
      title: '🔔 Test Email Notification',
      message: 'This is a test message from Page Monitor. If you see this, email notifications are working correctly.',
      level: 'info',
      platform: 'system',
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, message: 'Test notification sent' });
  } catch (e) {
    return apiCatch(e);
  }
}
