import { NextResponse } from 'next/server';
import { sendAlert } from '@/lib/notify';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withAuth } from '@/lib/auth';

export const POST = withAuth(async (req: Request) => {
    const rateLimited = await rateLimit(getClientIp(req), { store: 'test-email-notification', max: 3 });
    if (rateLimited) return rateLimited;

    await sendAlert({
      title: '🔔 Test Email Notification',
      message: 'This is a test message from Page Monitor. If you see this, email notifications are working correctly.',
      level: 'info',
      platform: 'system',
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, message: 'Test notification sent' });
});
