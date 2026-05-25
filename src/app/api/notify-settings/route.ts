import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireApiAuth, validateSession } from '@/lib/auth';
import { getSetting, setSetting, logAuditEntry } from '@/lib/db';

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
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
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  if (!(await validateSession(session))) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { slack_webhook, smtp_host, smtp_port, smtp_user, smtp_pass, email_from, email_to } = body;

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
      await setSetting('notify_smtp_pass', smtp_pass);
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
    }

    return NextResponse.json({ ok: true, message: 'Notification settings updated' });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
