import { listPlatformConnectors, getPlatformConnector, getEndpoint, insertSnapshot } from './db';
import { broadcastSSE } from './sse';
import { createLogger } from './logger';

const log = createLogger('connector-poller');

const timers = new Map<string, ReturnType<typeof setInterval>>();
const lastRuns = new Map<string, number>();

function getValueByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

async function pollConnector(connectorId: string) {
  const now = Date.now();
  const lastRun = lastRuns.get(connectorId) ?? 0;
  if (now - lastRun < 5000) return;
  lastRuns.set(connectorId, now);

  const connector = await getPlatformConnector(connectorId);
  if (!connector || !connector.is_active) return;

  try {
    const headers: Record<string, string> = {};
    if (connector.auth_header && connector.auth_token) {
      headers[connector.auth_header] = connector.auth_token;
    }

    const res = await fetch(connector.api_url, { headers });
    if (!res.ok) {
      log.warn({ name: connector.name, status: res.status }, '%s: HTTP %d', connector.name, res.status);
      return;
    }

    const data = await res.json();
    let items: unknown[] = Array.isArray(data) ? data : [];

    if (connector.json_path) {
      const resolved = getValueByPath(data, connector.json_path);
      if (Array.isArray(resolved)) items = resolved;
    }

    if (!Array.isArray(items)) {
      log.warn({ name: connector.name }, '%s: response is not an array', connector.name);
      return;
    }

    const runId = `connector_${connector.id}_${now}`;
    const ts = new Date().toISOString();

    const activePages = items.map((item) => {
      const r = item as Record<string, unknown>;
      return {
        page_id: (r.id as string) || (r.page_id as string) || String(r.name ?? ''),
        id: (r.id as string) || (r.page_id as string) || String(r.name ?? ''),
        name: (r.name as string) || (r.page_name as string) || 'Unknown',
        shop_label: (r.shop_label as string | null) ?? null,
        shop: (r.shop as string | null) ?? null,
        activity_kind: (r.activity_kind as string | null) ?? (r.kind as string | null) ?? null,
        kind: (r.activity_kind as string | null) ?? (r.kind as string | null) ?? null,
        is_activated: r.is_activated !== false,
        is_canary: r.is_canary === true,
        activation_reason: (r.activation_reason as string | null) ?? (r.reason as string | null) ?? null,
        reason: (r.activation_reason as string | null) ?? (r.reason as string | null) ?? null,
        state_change: (r.state_change as string | null) ?? null,
        activity_kind_change: (r.activity_kind_change as string | null) ?? null,
        last_order_at: null,
        last_customer_activity_at: null,
        response_ms: (r.response_ms as number | null) ?? (r.response_time_ms as number | null) ?? null,
        fetch_errors: typeof r.fetch_errors === 'number' ? r.fetch_errors : 0,
      };
    });

    const result = await insertSnapshot({
      run_id: runId,
      endpoint_id: connector.id,
      generated_at: ts,
      heartbeat_ok: true,
      run_quality: 'full',
      severity: null,
      canary_status: 'ok',
      canary_alert: false,
      outage_suspected: false,
      alert_count: 0,
      rule_version: null,
      in_maintenance_window: false,
      total_pages: activePages.length,
      active_pages_count: activePages.length,
      inactive_pages_count: 0,
      receiver_sd_size_bytes: null,
      raw_summary: { source: `connector:${connector.name}`, page_count: activePages.length },
      active_pages: activePages,
      inactive_pages: [],
    });

    if (result.inserted) {
      log.info('%s: inserted %d pages, run %s', connector.name, activePages.length, runId);
      broadcastSSE('refresh', JSON.stringify({ source: `connector:${connector.name}`, run_id: runId, endpoint_id: connector.id }));
    }
  } catch (err) {
    log.error({ err, name: connector.name }, '%s: error', connector.name);
  }
}

export async function startConnectorPollers() {
  const connectors = await listPlatformConnectors();
  for (const c of connectors) {
    if (!c.is_active) continue;
    if (timers.has(c.id)) continue;

    pollConnector(c.id);
    const interval = setInterval(() => pollConnector(c.id), Math.max(10000, c.interval_ms));
    timers.set(c.id, interval);
    log.info('started: %s (every %ds)', c.name, c.interval_ms / 1000);
  }
}

export function stopConnectorPollers() {
  for (const timer of timers.values()) {
    clearInterval(timer);
  }
  timers.clear();
  lastRuns.clear();
  log.info('all pollers stopped');
}
