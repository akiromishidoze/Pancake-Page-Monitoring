import nodemailer from 'nodemailer';
import { getSetting, queryRow, type RunRow } from './db';
import { decrypt, encrypt } from './crypto';
import { createLogger } from './logger';
import { addNotification } from './notifications';

const log = createLogger('notify');

type AlertLevel = 'info' | 'warning' | 'critical';

type AlertEvent = {
  title: string;
  message: string;
  level: AlertLevel;
  platform?: string;
  timestamp?: string;
};

// ─── Slack ────────────────────────────────────────────────────────────

async function sendSlack(webhookUrl: string, event: AlertEvent): Promise<boolean> {
  const colors: Record<AlertLevel, string> = {
    info: '#3b82f6',
    warning: '#f59e0b',
    critical: '#ef4444',
  };

  const payload = {
    attachments: [{
      color: colors[event.level],
      title: event.title,
      text: event.message,
      fields: [
        { title: 'Level', value: event.level.toUpperCase(), short: true },
        { title: 'Platform', value: event.platform || '—', short: true },
      ],
      footer: 'Page Monitor',
      ts: Math.floor(event.timestamp ? new Date(event.timestamp).getTime() / 1000 : Date.now() / 1000),
    }],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    log.warn({ err: e }, 'slack webhook fetch failed');
    return false;
  }
}

// ─── Email ────────────────────────────────────────────────────────────

async function sendEmail(event: AlertEvent): Promise<boolean> {
  const [host, portStr, user, rawPass, from, to] = await Promise.all([
    getSetting('notify_smtp_host'),
    getSetting('notify_smtp_port'),
    getSetting('notify_smtp_user'),
    getSetting('notify_smtp_pass'),
    getSetting('notify_email_from'),
    getSetting('notify_email_to'),
  ]);

  if (!host || !user || !rawPass || !to) return false;

  let pass: string;
  try {
    pass = rawPass.includes(':') ? decrypt(rawPass) : rawPass;
  } catch (e) {
    log.warn({ err: e }, 'failed to decrypt SMTP password, using raw');
    pass = rawPass;
  }

  const port = portStr ? parseInt(portStr, 10) : 587;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: from || user,
      to,
      subject: `[${event.level.toUpperCase()}] ${event.title}`,
      text: `${event.message}\n\nLevel: ${event.level.toUpperCase()}\nPlatform: ${event.platform || '—'}\nTimestamp: ${event.timestamp || new Date().toISOString()}`,
    });

    return true;
  } catch (e) {
    log.warn({ err: e }, 'sendmail failed');
    return false;
  }
}

// ─── In-memory dedup cache (30-minute TTL, lost on restart) ────────────

const CACHE_TTL_MS = 30 * 60 * 1000;

const dedupCache = new Map<string, number>();

function isDuplicate(dedupKey: string): boolean {
  const now = Date.now();
  const expiry = dedupCache.get(dedupKey);
  if (expiry !== undefined && expiry > now) return true;
  dedupCache.delete(dedupKey);
  return false;
}

function markSent(dedupKey: string): void {
  dedupCache.set(dedupKey, Date.now() + CACHE_TTL_MS);
}

// ─── Dispatch ─────────────────────────────────────────────────────────

export async function sendAlert(event: AlertEvent): Promise<void> {
  const [slackUrl] = await Promise.all([
    getSetting('notify_slack_webhook'),
  ]);

  const dedupKey = `${event.title}|${event.message}`;
  if (isDuplicate(dedupKey)) return;
  markSent(dedupKey);

  if (slackUrl) {
    const ok = await sendSlack(slackUrl, event);
    if (ok) {
      log.info({ title: event.title }, 'slack alert sent');
    } else {
      log.warn({ title: event.title }, 'slack send failed');
    }
  }

  const emailOk = await sendEmail(event);
  if (emailOk) {
    log.info({ title: event.title }, 'email alert sent');
  }

  void addNotification('alert_triggered', event.level, event.title, event.message, { platform: event.platform });
}

export async function checkAlertsForRun(runId: string): Promise<void> {
  const run = (await queryRow<RunRow>('SELECT * FROM runs WHERE run_id = $1', [runId])) ?? null;
  if (!run) return;

  const h = run;
  const now = new Date().toISOString();

  // Canary down
  if (h.canary_status === 'down') {
    await sendAlert({
      title: '🔴 Canary is DOWN',
      message: `Canary status is "down" for the latest run. Immediate attention required.`,
      level: 'critical',
      platform: h.endpoint_id || undefined,
      timestamp: now,
    });
    void addNotification('canary_down', 'critical', 'Canary is DOWN', `Canary status is "down" for endpoint ${h.endpoint_id} in run ${h.run_id}`);
  }

  // Outage suspected
  if (h.outage_suspected) {
    await sendAlert({
      title: '⚠️ Outage Suspected',
      message: `Outage flag is set for run ${h.run_id}. Alert count: ${h.alert_count}`,
      level: 'critical',
      platform: h.endpoint_id || undefined,
      timestamp: now,
    });
    void addNotification('outage_suspected', 'critical', 'Outage Suspected', `Outage flag triggered for endpoint ${h.endpoint_id || 'unknown'} in run ${h.run_id}`);
  }

  // High alert count
  if ((h.alert_count ?? 0) >= 3) {
    await sendAlert({
      title: '⚠️ Multiple Alerts',
      message: `Run ${h.run_id} has ${h.alert_count} alerts.`,
      level: 'warning',
      platform: h.endpoint_id || undefined,
      timestamp: now,
    });
  }

  // Degraded run quality
  if (h.run_quality === 'degraded') {
    await sendAlert({
      title: '🟡 Run Quality Degraded',
      message: `Run quality is "degraded" for run ${h.run_id}. Severity: ${h.severity ?? '—'}`,
      level: 'warning',
      platform: h.endpoint_id || undefined,
      timestamp: now,
    });
  }

  // Heartbeat stale
  if (!h.heartbeat_ok) {
    await sendAlert({
      title: '💔 Heartbeat Stale',
      message: `Heartbeat is stale. Last run: ${h.run_id}`,
      level: 'warning',
      platform: h.endpoint_id || undefined,
      timestamp: now,
    });
  }
}
