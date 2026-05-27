import nodemailer from 'nodemailer';
import { getSetting, setSetting, pool, type RunRow } from './db';
import { decrypt, encrypt } from './crypto';

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
  } catch {
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
  } catch {
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
  } catch {
    return false;
  }
}

// ─── Dedup cache (persisted to settings table) ────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000;
const SETTINGS_KEY = 'notify_dedup';

let dedupCache: Map<string, number> | null = null;

async function loadDedupCache(): Promise<Map<string, number>> {
  if (dedupCache !== null) return dedupCache;
  const raw = await getSetting(SETTINGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      const map = new Map<string, number>();
      const now = Date.now();
      for (const [key, expiry] of Object.entries(parsed)) {
        if (expiry > now) map.set(key, expiry);
      }
      dedupCache = map;
    } catch {
      dedupCache = new Map();
    }
  } else {
    dedupCache = new Map();
  }
  return dedupCache;
}

async function persistDedupCache(): Promise<void> {
  if (dedupCache === null) return;
  const obj: Record<string, number> = {};
  for (const [key, expiry] of dedupCache.entries()) {
    obj[key] = expiry;
  }
  await setSetting(SETTINGS_KEY, JSON.stringify(obj));
}

async function isDuplicate(dedupKey: string): Promise<boolean> {
  const cache = await loadDedupCache();
  const now = Date.now();
  const expiry = cache.get(dedupKey);
  if (expiry !== undefined && expiry > now) return true;
  return false;
}

async function markSent(dedupKey: string): Promise<void> {
  const cache = await loadDedupCache();
  cache.set(dedupKey, Date.now() + CACHE_TTL_MS);
  void persistDedupCache();
}

// ─── Dispatch ─────────────────────────────────────────────────────────

export async function sendAlert(event: AlertEvent): Promise<void> {
  const [slackUrl] = await Promise.all([
    getSetting('notify_slack_webhook'),
  ]);

  const dedupKey = `${event.title}|${event.message}`;
  if (await isDuplicate(dedupKey)) return;
  await markSent(dedupKey);

  if (slackUrl) {
    const ok = await sendSlack(slackUrl, event);
    if (ok) {
      console.log('[notify] slack alert sent:', event.title);
    } else {
      console.warn('[notify] slack send failed:', event.title);
    }
  }

  const emailOk = await sendEmail(event);
  if (emailOk) {
    console.log('[notify] email alert sent:', event.title);
  }
}

export async function checkAlertsForRun(runId: string): Promise<void> {
  const r = await pool.query('SELECT * FROM runs WHERE run_id = $1', [runId]);
  const run = (r.rows[0] ?? null) as RunRow | null;
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
