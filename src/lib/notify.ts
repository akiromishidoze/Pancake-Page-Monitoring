import { getSetting, getLatestRun, getRunCount } from './db';

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

// ─── Dispatch ─────────────────────────────────────────────────────────

const sentCache = new Set<string>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function sendAlert(event: AlertEvent): Promise<void> {
  const slackUrl = getSetting('notify_slack_webhook');

  if (!slackUrl) return;

  // Deduplicate: skip identical alerts within 30 minutes
  const dedupKey = `${event.title}|${event.message}`;
  if (sentCache.has(dedupKey)) return;
  sentCache.add(dedupKey);
  setTimeout(() => sentCache.delete(dedupKey), CACHE_TTL_MS);

  if (slackUrl) {
    const ok = await sendSlack(slackUrl, event);
    if (ok) {
      console.log('[notify] slack alert sent:', event.title);
    } else {
      console.warn('[notify] slack send failed:', event.title);
    }
  }
}

export async function checkAlertsForRun(runId: string): Promise<void> {
  const run = getLatestRun();
  if (!run || run.run_id !== runId) return;

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
  if (h.heartbeat_ok === 0) {
    await sendAlert({
      title: '💔 Heartbeat Stale',
      message: `Heartbeat is stale. Last run: ${h.run_id}`,
      level: 'warning',
      platform: h.endpoint_id || undefined,
      timestamp: now,
    });
  }
}
