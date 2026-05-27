import { NextResponse } from 'next/server';
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
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
