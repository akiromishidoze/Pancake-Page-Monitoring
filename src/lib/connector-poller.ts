import { listPlatformConnectors, getPlatformConnector, getEndpoint, insertSnapshot, getDb } from './db';
import { broadcastSSE } from './sse';

const timers = new Map<string, ReturnType<typeof setInterval>>();
const lastRuns = new Map<string, number>();

function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

async function pollConnector(connectorId: string) {
  const now = Date.now();
  const lastRun = lastRuns.get(connectorId) ?? 0;
  if (now - lastRun < 5000) return;
  lastRuns.set(connectorId, now);

  const connector = getPlatformConnector(connectorId);
  if (!connector || !connector.is_active) return;

  try {
    const headers: Record<string, string> = {};
    if (connector.auth_header && connector.auth_token) {
      headers[connector.auth_header] = connector.auth_token;
    }

    const res = await fetch(connector.api_url, { headers });
    if (!res.ok) {
      console.warn(`[connector-poller] ${connector.name}: HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    let items: any[] = data;

    if (connector.json_path) {
      const resolved = getValueByPath(data, connector.json_path);
      if (Array.isArray(resolved)) items = resolved;
    }

    if (!Array.isArray(items)) {
      console.warn(`[connector-poller] ${connector.name}: response is not an array`);
      return;
    }

    const runId = `connector_${connector.id}_${now}`;
    const ts = new Date().toISOString();

    const activePages = items.map((item: any) => ({
      page_id: item.id || item.page_id || String(item.name ?? ''),
      id: item.id || item.page_id || String(item.name ?? ''),
      name: item.name || item.page_name || 'Unknown',
      shop_label: item.shop_label ?? null,
      shop: item.shop ?? null,
      activity_kind: item.activity_kind ?? item.kind ?? null,
      kind: item.activity_kind ?? item.kind ?? null,
      is_activated: item.is_activated !== false,
      is_canary: item.is_canary === true,
      activation_reason: item.activation_reason ?? item.reason ?? null,
      reason: item.activation_reason ?? item.reason ?? null,
      state_change: item.state_change ?? null,
      activity_kind_change: item.activity_kind_change ?? null,
      last_order_at: null,
      last_customer_activity_at: null,
      response_ms: item.response_ms ?? item.response_time_ms ?? null,
      fetch_errors: typeof item.fetch_errors === 'number' ? item.fetch_errors : 0,
    }));

    const result = insertSnapshot({
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
      console.log(`[connector-poller] ${connector.name}: inserted ${activePages.length} pages, run ${runId}`);
      broadcastSSE('refresh', JSON.stringify({ source: `connector:${connector.name}`, run_id: runId }));
    }
  } catch (err) {
    console.error(`[connector-poller] ${connector.name}: error:`, err);
  }
}

export function startConnectorPollers() {
  const connectors = listPlatformConnectors();
  for (const c of connectors) {
    if (!c.is_active) continue;
    if (timers.has(c.id)) continue;

    pollConnector(c.id);
    const interval = setInterval(() => pollConnector(c.id), Math.max(10000, c.interval_ms));
    timers.set(c.id, interval);
    console.log(`[connector-poller] started: ${c.name} (every ${c.interval_ms / 1000}s)`);
  }
}

export function restartConnectorPollers() {
  for (const [id, timer] of timers) {
    clearInterval(timer);
  }
  timers.clear();
  lastRuns.clear();
  startConnectorPollers();
}
