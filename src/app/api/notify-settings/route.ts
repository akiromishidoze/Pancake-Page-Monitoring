import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireApiAuth, validateSession } from '@/lib/auth';
import { getSetting, setSetting } from '@/lib/db';

export async function GET() {
  const auth = await requireApiAuth(); if (auth) return auth;
  const slackWebhook = (await getSetting('notify_slack_webhook')) || '';
  return NextResponse.json({
    ok: true,
    slack_webhook: slackWebhook ? slackWebhook.slice(0, 8) + '••••' + slackWebhook.slice(-8) : '',
    slack_configured: !!slackWebhook,
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
    const { slack_webhook } = body;

    if (slack_webhook !== undefined) {
      await setSetting('notify_slack_webhook', slack_webhook);
    }

    return NextResponse.json({ ok: true, message: 'Notification settings updated' });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
