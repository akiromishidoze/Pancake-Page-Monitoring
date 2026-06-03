import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { getSetting, setSetting, logAuditEntry } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { NotifySettingsSchema } from '@/lib/schemas';
import { requireApiAuth, withAuth } from '@/lib/auth';
import { addNotification } from '@/lib/notifications';

export const GET = withAuth(async () => {
    const slackWebhook = (await getSetting('notify_slack_webhook')) || '';
    const smtpHost = (await getSetting('notify_smtp_host')) || '';
    const smtpPort = (await getSetting('notify_smtp_port')) || '';
    const smtpUser = (await getSetting('notify_smtp_user')) || '';
    const emailFrom = (await getSetting('notify_email_from')) || '';
    const emailTo = (await getSetting('notify_email_to')) || '';
    return NextResponse.json({
      ok: true,
      slack_webhook: slackWebhook ? slackWebhook.slice(0, 8) + '••••' + slackWebhook.slice(-8) : '',
      slack_configured: !!slackWebhook,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_user: smtpUser,
      smtp_pass_configured: !!(await getSetting('notify_smtp_pass')),
      email_from: emailFrom,
      email_to: emailTo,
      email_configured: !!(smtpHost && smtpUser && emailTo),
    });
});

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth) return auth;

  const ip = getClientIp(req);
  const rateLimited = rateLimit(ip, { store: 'notify-settings', max: 20 });
  if (rateLimited) return rateLimited;

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(ErrorCodes.VALIDATION_INVALID_JSON, 'Invalid JSON', 400);
    }

    const parsed = NotifySettingsSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, parsed.error.flatten());
    }

    const { slack_webhook, smtp_host, smtp_port, smtp_user, smtp_pass, email_from, email_to } = parsed.data;

    const changes: string[] = [];

    if (slack_webhook !== undefined) {
      await setSetting('notify_slack_webhook', slack_webhook);
      changes.push('slack_webhook');
    }
    if (smtp_host !== undefined) {
      await setSetting('notify_smtp_host', smtp_host);
      changes.push('smtp_host');
    }
    if (smtp_port !== undefined) {
      await setSetting('notify_smtp_port', smtp_port);
      changes.push('smtp_port');
    }
    if (smtp_user !== undefined) {
      await setSetting('notify_smtp_user', smtp_user);
      changes.push('smtp_user');
    }
    if (smtp_pass !== undefined) {
      await setSetting('notify_smtp_pass', encrypt(smtp_pass));
      changes.push('smtp_pass');
    }
    if (email_from !== undefined) {
      await setSetting('notify_email_from', email_from);
      changes.push('email_from');
    }
    if (email_to !== undefined) {
      await setSetting('notify_email_to', email_to);
      changes.push('email_to');
    }

    if (changes.length > 0) {
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
      void logAuditEntry('update_notify_settings', 'settings', 'notifications', `Changed: ${changes.join(', ')}`, ip);
      void addNotification('credential_change', 'info', 'Notification Settings Updated', `Notification settings changed: ${changes.join(', ')}`);
    }

    return NextResponse.json({ ok: true, message: 'Notification settings updated' });
  } catch (e) {
    return apiCatch(e);
  }
}
