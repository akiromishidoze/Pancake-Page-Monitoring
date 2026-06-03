import { NextResponse } from 'next/server';
import { apiCatch } from '@/lib/errors';
import { sendAlert } from '@/lib/notify';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { requireApiAuth } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth) return auth;
    const rateLimited = rateLimit(getClientIp(req), { store: 'test-email-notification', max: 5 });
    if (rateLimited) return rateLimited;

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
