import { Pool } from 'pg';
import { parse } from 'pg-connection-string';

const connectionString = process.env.DATABASE_URL || '';
const parsed = parse(connectionString);
const pool = new Pool({
  host: parsed.host || undefined,
  port: parsed.port ? parseInt(String(parsed.port), 10) : undefined,
  database: parsed.database || undefined,
  user: parsed.user || undefined,
  password: parsed.password || undefined,
  ssl: parsed.ssl === true || parsed.ssl === 'true' ? { rejectUnauthorized: false } : (parsed.ssl ? { rejectUnauthorized: false } : undefined),
});
export { pool };

// Log connection errors without crashing
pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err.message);
});

// ──── SQL helper: convert @name params to $1, $2 positional ──────────

function q(sql: string, params?: Record<string, unknown>): { text: string; values: unknown[] } {
  if (!params) return { text: sql, values: [] };
  const values: unknown[] = [];
  let idx = 0;
  const text = sql.replace(/@(\w+)/g, (_, key) => {
    idx++;
    values.push(params[key] ?? null);
    return `$${idx}`;
  });
  return { text, values };
}

// ──── Schema ──────────────────────────────────────────────────────────

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      api_key TEXT NOT NULL,
      access_token TEXT,
      shop_label TEXT,
      token_expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      endpoint_id TEXT REFERENCES endpoints(id) ON DELETE SET NULL,
      generated_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      heartbeat_ok INTEGER,
      run_quality TEXT,
      severity TEXT,
      canary_status TEXT,
      canary_alert INTEGER,
      outage_suspected INTEGER,
      alert_count INTEGER,
      rule_version INTEGER,
      in_maintenance_window INTEGER,
      total_pages INTEGER,
      active_pages INTEGER,
      inactive_pages INTEGER,
      receiver_sd_size_bytes INTEGER,
      raw_summary TEXT
    );
    CREATE INDEX IF NOT EXISTS runs_endpoint_id_idx ON runs(endpoint_id);
    CREATE INDEX IF NOT EXISTS runs_generated_at_idx ON runs(generated_at DESC);
    CREATE TABLE IF NOT EXISTS page_states (
      id SERIAL PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
      page_id TEXT NOT NULL,
      shop_label TEXT,
      page_name TEXT,
      activity_kind TEXT,
      is_activated INTEGER,
      is_canary INTEGER,
      activation_reason TEXT,
      state_change TEXT,
      activity_kind_change TEXT,
      hours_since_last_order REAL,
      hours_since_last_customer_activity REAL,
      response_ms REAL,
      fetch_errors INTEGER,
      customer_count INTEGER,
      generated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS page_states_page_id_time ON page_states(page_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS page_states_run_id ON page_states(run_id);
    CREATE INDEX IF NOT EXISTS page_states_kind_time ON page_states(activity_kind, generated_at DESC);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_pages (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
      page_name TEXT NOT NULL,
      page_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS platform_pages_endpoint_idx ON platform_pages(endpoint_id);
    CREATE TABLE IF NOT EXISTS platform_connectors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform_type TEXT NOT NULL,
      api_url TEXT NOT NULL,
      auth_header TEXT,
      auth_token TEXT,
      json_path TEXT,
      interval_ms INTEGER NOT NULL DEFAULT 60000,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS platform_connectors_active ON platform_connectors(is_active);
  `);
  try { await pool.query(`ALTER TABLE page_states ADD COLUMN IF NOT EXISTS customer_count INTEGER`); } catch {}
}

let _migrated = false;
async function ensureMigrated() {
  if (_migrated) return;
  await migrate();
  _migrated = true;
}

// ──── Types ────────────────────────────────────────────────────────────

export type SlimPage = {
  shop?: string | null;
  shop_label?: string | null;
  name: string;
  page_id?: string | null;
  id?: string | null;
  kind?: string | null;
  activity_kind?: string | null;
  reason?: string | null;
  activation_reason?: string | null;
  last_order_at?: string | null;
  last_customer_activity_at?: string | null;
  state_change?: string | null;
  activity_kind_change?: string | null;
  is_canary?: boolean;
  response_ms?: number | null;
  response_time_ms?: number | null;
  latency_ms?: number | null;
  fetch_latency_ms?: number | null;
  fetch_errors?: number;
  fetch_error_count?: number;
  fetch_failed?: boolean;
  customer_count?: number;
};

export type RunRow = {
  run_id: string;
  endpoint_id: string | null;
  generated_at: string;
  received_at: string;
  heartbeat_ok: number | null;
  run_quality: string | null;
  severity: string | null;
  canary_status: string | null;
  canary_alert: number | null;
  outage_suspected: number | null;
  alert_count: number | null;
  rule_version: number | null;
  in_maintenance_window: number | null;
  total_pages: number | null;
  active_pages: number | null;
  inactive_pages: number | null;
  receiver_sd_size_bytes: number | null;
  raw_summary: string;
};

export type PageStateRow = {
  id: number;
  run_id: string;
  page_id: string;
  shop_label: string | null;
  page_name: string | null;
  activity_kind: string | null;
  is_activated: number | null;
  is_canary: number | null;
  activation_reason: string | null;
  state_change: string | null;
  activity_kind_change: string | null;
  hours_since_last_order: number | null;
  hours_since_last_customer_activity: number | null;
  response_ms: number | null;
  fetch_errors: number | null;
  customer_count: number | null;
  generated_at: string;
};

// ──── Insert / upsert ──────────────────────────────────────────────────

export type InsertSnapshotInput = {
  run_id: string;
  endpoint_id?: string;
  generated_at: string;
  heartbeat_ok: boolean;
  run_quality: string | null;
  severity: string | null;
  canary_status: string | null;
  canary_alert: boolean;
  outage_suspected: boolean;
  alert_count: number;
  rule_version: number | null;
  in_maintenance_window: boolean;
  total_pages: number | null;
  active_pages_count: number | null;
  inactive_pages_count: number | null;
  receiver_sd_size_bytes: number | null;
  raw_summary: object;
  active_pages: SlimPage[];
  inactive_pages: SlimPage[];
  unknown_pages?: SlimPage[];
};

export async function insertSnapshot(input: InsertSnapshotInput): Promise<{ inserted: boolean }> {
  await ensureMigrated();
  const existing = await pool.query('SELECT 1 FROM runs WHERE run_id = $1', [input.run_id]);
  if (existing.rows.length > 0) return { inserted: false };

  const allPages = [
    ...input.active_pages.map(p => ({
      ...p,
      _is_active: 1,
      response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
      fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : p.fetch_failed ? 1 : 0),
    })),
    ...input.inactive_pages.map(p => ({
      ...p,
      _is_active: 0,
      response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
      fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : p.fetch_failed ? 1 : 0),
    })),
    ...(input.unknown_pages ?? []).map(p => ({
      ...p,
      _is_active: null,
      response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
      fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : p.fetch_failed ? 1 : 0),
    })),
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(q(`
      INSERT INTO runs (
        run_id, endpoint_id, generated_at, received_at, heartbeat_ok, run_quality, severity,
        canary_status, canary_alert, outage_suspected, alert_count, rule_version,
        in_maintenance_window, total_pages, active_pages, inactive_pages,
        receiver_sd_size_bytes, raw_summary
      ) VALUES (
        @run_id, @endpoint_id, @generated_at, @received_at, @heartbeat_ok, @run_quality, @severity,
        @canary_status, @canary_alert, @outage_suspected, @alert_count, @rule_version,
        @in_maintenance_window, @total_pages, @active_pages, @inactive_pages,
        @receiver_sd_size_bytes, @raw_summary
      )
    `, {
      run_id: input.run_id,
      endpoint_id: input.endpoint_id ?? null,
      generated_at: input.generated_at,
      received_at: new Date().toISOString(),
      heartbeat_ok: input.heartbeat_ok ? 1 : 0,
      run_quality: input.run_quality,
      severity: input.severity,
      canary_status: input.canary_status,
      canary_alert: input.canary_alert ? 1 : 0,
      outage_suspected: input.outage_suspected ? 1 : 0,
      alert_count: input.alert_count,
      rule_version: input.rule_version,
      in_maintenance_window: input.in_maintenance_window ? 1 : 0,
      total_pages: input.total_pages,
      active_pages: input.active_pages_count,
      inactive_pages: input.inactive_pages_count,
      receiver_sd_size_bytes: input.receiver_sd_size_bytes,
      raw_summary: JSON.stringify(input.raw_summary),
    }));

    for (const p of allPages) {
      await client.query(q(`
        INSERT INTO page_states (
          run_id, page_id, shop_label, page_name, activity_kind, is_activated,
          is_canary, activation_reason, state_change, activity_kind_change,
          hours_since_last_order, hours_since_last_customer_activity, response_ms, fetch_errors, generated_at, customer_count
        ) VALUES (
          @run_id, @page_id, @shop_label, @page_name, @activity_kind, @is_activated,
          @is_canary, @activation_reason, @state_change, @activity_kind_change,
          @hours_since_last_order, @hours_since_last_customer_activity, @response_ms, @fetch_errors, @generated_at, @customer_count
        )
      `, {
        run_id: input.run_id,
        page_id: p.page_id ?? p.id ?? '',
        shop_label: p.shop_label ?? p.shop ?? null,
        page_name: p.name ?? null,
        activity_kind: p.activity_kind ?? p.kind ?? null,
        is_activated: p._is_active,
        is_canary: p.is_canary ? 1 : 0,
        activation_reason: p.activation_reason ?? p.reason ?? null,
        state_change: p.state_change ?? null,
        activity_kind_change: p.activity_kind_change ?? null,
        hours_since_last_order: p.last_order_at
          ? (new Date(input.generated_at).getTime() - new Date(p.last_order_at).getTime()) / (1000 * 60 * 60)
          : null,
        hours_since_last_customer_activity: p.last_customer_activity_at
          ? (new Date(input.generated_at).getTime() - new Date(p.last_customer_activity_at).getTime()) / (1000 * 60 * 60)
          : null,
        response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
        fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : null),
        generated_at: input.generated_at,
        customer_count: p.customer_count ?? null,
      }));
    }
    await client.query('COMMIT');
    return { inserted: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ──── Read helpers ─────────────────────────────────────────────────────

export async function getLatestRun(endpointId?: string): Promise<RunRow | undefined> {
  await ensureMigrated();
  if (endpointId) {
    const r = await pool.query('SELECT * FROM runs WHERE endpoint_id = $1 ORDER BY generated_at DESC LIMIT 1', [endpointId]);
    return r.rows[0] as RunRow | undefined;
  }
  const r = await pool.query('SELECT * FROM runs ORDER BY generated_at DESC LIMIT 1');
  return r.rows[0] as RunRow | undefined;
}

export async function getRunHistory(endpointId: string, limit = 100): Promise<RunRow[]> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM runs WHERE endpoint_id = $1 ORDER BY generated_at ASC LIMIT $2', [endpointId, limit]);
  return r.rows as RunRow[];
}

export async function getRecentRuns(limit = 50, endpointId?: string): Promise<RunRow[]> {
  await ensureMigrated();
  if (endpointId) {
    const r = await pool.query('SELECT * FROM runs WHERE endpoint_id = $1 ORDER BY generated_at DESC LIMIT $2', [endpointId, limit]);
    return r.rows as RunRow[];
  }
  const r = await pool.query('SELECT * FROM runs ORDER BY generated_at DESC LIMIT $1', [limit]);
  return r.rows as RunRow[];
}

async function latestGoodRunIds(): Promise<string[]> {
  await ensureMigrated();
  const r = await pool.query(`
    SELECT run_id FROM runs r1
    WHERE endpoint_id != 'botcake-platform' AND endpoint_id IS NOT NULL
    AND (active_pages > 0 OR active_pages IS NULL)
    AND generated_at = (
      SELECT MAX(generated_at) FROM runs r2
      WHERE r2.endpoint_id = r1.endpoint_id
      AND (active_pages > 0 OR active_pages IS NULL)
    )
    GROUP BY endpoint_id
  `);
  return (r.rows as { run_id: string }[]).map(r => r.run_id);
}

export async function getPancakeActivePageIds(): Promise<Set<string>> {
  const latestRunIds = await latestGoodRunIds();
  if (latestRunIds.length === 0) return new Set<string>();
  const placeholders = latestRunIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await pool.query(`SELECT page_id FROM page_states WHERE run_id IN (${placeholders}) AND is_activated = 1`, latestRunIds);
  return new Set((r.rows as { page_id: string }[]).map(r => r.page_id));
}

export async function getPancakeSeenEver(): Promise<Set<string>> {
  await ensureMigrated();
  const r = await pool.query(`
    SELECT DISTINCT ps.page_id
    FROM page_states ps
    JOIN runs r ON r.run_id = ps.run_id
    WHERE r.endpoint_id != 'botcake-platform' AND r.endpoint_id IS NOT NULL
  `);
  return new Set((r.rows as { page_id: string }[]).map(r => r.page_id));
}

export async function getPancakeInactivePageIds(): Promise<Set<string>> {
  const active = await getPancakeActivePageIds();
  const latestRunIds = await latestGoodRunIds();
  if (latestRunIds.length === 0) return new Set<string>();
  const placeholders = latestRunIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await pool.query(`SELECT DISTINCT page_id FROM page_states WHERE run_id IN (${placeholders}) AND (is_activated = 0 OR is_activated IS NULL)`, latestRunIds);
  const result = new Set<string>();
  for (const row of r.rows as { page_id: string }[]) {
    if (!active.has(row.page_id)) result.add(row.page_id);
  }
  return result;
}

export async function getLatestPageStates(endpointId?: string): Promise<PageStateRow[]> {
  await ensureMigrated();
  if (endpointId) {
    const ep = endpointId ? await getEndpoint(endpointId) : undefined;
    const r = await pool.query(`
      SELECT ps.* FROM page_states ps
      JOIN runs r ON r.run_id = ps.run_id
      WHERE r.endpoint_id = $1
      AND r.run_id = (SELECT run_id FROM runs WHERE endpoint_id = $2 ORDER BY generated_at DESC LIMIT 1)
      ORDER BY ps.shop_label, ps.page_name
    `, [endpointId, endpointId]);
    if (r.rows.length > 0) return r.rows as PageStateRow[];

    if (ep?.shop_label) {
      const r2 = await pool.query(`
        SELECT ps.* FROM page_states ps
        JOIN runs r ON r.run_id = ps.run_id
        WHERE r.endpoint_id IS NULL
        AND ps.shop_label = $1
        AND r.run_id = (SELECT run_id FROM runs WHERE endpoint_id IS NULL ORDER BY generated_at DESC LIMIT 1)
        ORDER BY ps.page_name
      `, [ep.shop_label]);
      return r2.rows as PageStateRow[];
    }
    return [];
  }
  const r = await pool.query(`
    SELECT ps.* FROM page_states ps
    JOIN runs r ON r.run_id = ps.run_id
    WHERE r.run_id = (
      SELECT run_id FROM runs
      WHERE endpoint_id IS NULL OR endpoint_id != 'botcake-platform'
      ORDER BY generated_at DESC LIMIT 1
    )
    ORDER BY ps.shop_label, ps.page_name
  `);
  return r.rows as PageStateRow[];
}

export async function getPageHistory(pageId: string, limit = 1000): Promise<PageStateRow[]> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM page_states WHERE page_id = $1 ORDER BY generated_at ASC LIMIT $2', [pageId, limit]);
  return r.rows as PageStateRow[];
}

// ──── Endpoints ───────────────────────────────────────────────────────

export type EndpointRow = {
  id: string;
  name: string;
  url: string | null;
  api_key: string;
  access_token: string | null;
  token_expires_at: string | null;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
  shop_label: string | null;
};

export async function listEndpoints(): Promise<EndpointRow[]> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM endpoints ORDER BY created_at DESC');
  return r.rows as EndpointRow[];
}

export async function getEndpoint(id: string): Promise<EndpointRow | undefined> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM endpoints WHERE id = $1', [id]);
  return r.rows[0] as EndpointRow | undefined;
}

export async function getEndpointByName(name: string): Promise<EndpointRow | undefined> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM endpoints WHERE name = $1', [name]);
  return r.rows[0] as EndpointRow | undefined;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function getEndpointBySlug(slug: string): Promise<EndpointRow | undefined> {
  const all = await listEndpoints();
  return all.find(e => slugify(e.name) === slug);
}

export async function getEndpointByApiKey(apiKey: string): Promise<EndpointRow | undefined> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM endpoints WHERE api_key = $1 AND is_active = 1', [apiKey]);
  return r.rows[0] as EndpointRow | undefined;
}

export async function upsertEndpoint(input: {
  id?: string;
  name: string;
  url?: string | null;
  api_key: string;
  access_token?: string | null;
  token_expires_at?: string | null;
  is_active?: number;
}): Promise<EndpointRow> {
  await ensureMigrated();
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.id) {
    await pool.query(q(`
      UPDATE endpoints SET name=@name, url=@url, api_key=@api_key,
        access_token=@access_token, token_expires_at=@token_expires_at, is_active=@is_active
      WHERE id=@id
    `, {
      id: input.id,
      name: input.name,
      url: input.url ?? null,
      api_key: input.api_key,
      access_token: input.access_token ?? null,
      token_expires_at: input.token_expires_at ?? null,
      is_active: input.is_active ?? 1,
    }));
    return (await getEndpoint(input.id))!;
  }

  await pool.query(q(`
    INSERT INTO endpoints (id, name, url, api_key, access_token, token_expires_at, is_active, created_at)
    VALUES (@id, @name, @url, @api_key, @access_token, @token_expires_at, @is_active, @created_at)
  `, {
    id,
    name: input.name,
    url: input.url ?? null,
    api_key: input.api_key,
    access_token: input.access_token ?? null,
    token_expires_at: input.token_expires_at ?? null,
    is_active: input.is_active ?? 1,
    created_at: now,
  }));

  return (await getEndpoint(id))!;
}

export async function deleteEndpoint(id: string): Promise<void> {
  await ensureMigrated();
  await pool.query('DELETE FROM platform_pages WHERE endpoint_id = $1', [id]);
  await pool.query('DELETE FROM endpoints WHERE id = $1', [id]);
}

export async function touchEndpoint(id: string): Promise<void> {
  await ensureMigrated();
  await pool.query('UPDATE endpoints SET last_used_at = $1 WHERE id = $2', [new Date().toISOString(), id]);
}

export async function getPreviousRunActiveCount(endpointId: string): Promise<number | null> {
  await ensureMigrated();
  const r = await pool.query(`
    SELECT active_pages FROM runs
    WHERE endpoint_id = $1
    ORDER BY generated_at DESC LIMIT 1 OFFSET 1
  `, [endpointId]);
  const row = r.rows[0] as { active_pages: number } | undefined;
  return row?.active_pages ?? null;
}

export async function getRunCount(endpointId?: string): Promise<number> {
  await ensureMigrated();
  if (endpointId) {
    const r = await pool.query('SELECT COUNT(*) as c FROM runs WHERE endpoint_id = $1', [endpointId]);
    return (r.rows[0] as { c: number }).c;
  }
  const r = await pool.query('SELECT COUNT(*) as c FROM runs');
  return (r.rows[0] as { c: number }).c;
}

// ──── Platform Pages ────────────────────────────────────────────────────

export type PlatformPageRow = {
  id: string;
  endpoint_id: string;
  page_name: string;
  page_url: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export async function listPlatformPages(endpointId?: string): Promise<PlatformPageRow[]> {
  await ensureMigrated();
  if (endpointId) {
    const r = await pool.query('SELECT * FROM platform_pages WHERE endpoint_id = $1 ORDER BY page_name ASC', [endpointId]);
    return r.rows as PlatformPageRow[];
  }
  const r = await pool.query('SELECT * FROM platform_pages ORDER BY page_name ASC');
  return r.rows as PlatformPageRow[];
}

export async function getPlatformPage(id: string): Promise<PlatformPageRow | undefined> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM platform_pages WHERE id = $1', [id]);
  return r.rows[0] as PlatformPageRow | undefined;
}

export async function upsertPlatformPage(input: {
  id?: string;
  endpoint_id: string;
  page_name: string;
  page_url?: string | null;
  is_active?: number;
}): Promise<PlatformPageRow> {
  await ensureMigrated();
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.id) {
    await pool.query(q(`
      UPDATE platform_pages SET page_name=@page_name, page_url=@page_url,
        is_active=@is_active, updated_at=@updated_at
      WHERE id=@id
    `, {
      id: input.id,
      page_name: input.page_name,
      page_url: input.page_url ?? null,
      is_active: input.is_active ?? 1,
      updated_at: now,
    }));
    return (await getPlatformPage(input.id))!;
  }

  await pool.query(q(`
    INSERT INTO platform_pages (id, endpoint_id, page_name, page_url, is_active, created_at, updated_at)
    VALUES (@id, @endpoint_id, @page_name, @page_url, @is_active, @created_at, @updated_at)
  `, {
    id,
    endpoint_id: input.endpoint_id,
    page_name: input.page_name,
    page_url: input.page_url ?? null,
    is_active: input.is_active ?? 1,
    created_at: now,
    updated_at: now,
  }));

  return (await getPlatformPage(id))!;
}

export async function deletePlatformPage(id: string): Promise<void> {
  await ensureMigrated();
  await pool.query('DELETE FROM platform_pages WHERE id = $1', [id]);
}

// ──── Platform Connectors ─────────────────────────────────────────────

export type PlatformConnectorRow = {
  id: string;
  name: string;
  platform_type: string;
  api_url: string;
  auth_header: string | null;
  auth_token: string | null;
  json_path: string | null;
  interval_ms: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export async function listPlatformConnectors(): Promise<PlatformConnectorRow[]> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM platform_connectors ORDER BY name ASC');
  return r.rows as PlatformConnectorRow[];
}

export async function getPlatformConnector(id: string): Promise<PlatformConnectorRow | undefined> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM platform_connectors WHERE id = $1', [id]);
  return r.rows[0] as PlatformConnectorRow | undefined;
}

export async function upsertPlatformConnector(input: {
  id?: string;
  name: string;
  platform_type: string;
  api_url: string;
  auth_header?: string | null;
  auth_token?: string | null;
  json_path?: string | null;
  interval_ms?: number;
  is_active?: number;
}): Promise<PlatformConnectorRow> {
  await ensureMigrated();
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.id) {
    await pool.query(q(`
      UPDATE platform_connectors SET name=@name, platform_type=@platform_type, api_url=@api_url,
        auth_header=@auth_header, auth_token=@auth_token, json_path=@json_path,
        interval_ms=@interval_ms, is_active=@is_active, updated_at=@updated_at
      WHERE id=@id
    `, {
      id: input.id,
      name: input.name,
      platform_type: input.platform_type,
      api_url: input.api_url,
      auth_header: input.auth_header ?? null,
      auth_token: input.auth_token ?? null,
      json_path: input.json_path ?? null,
      interval_ms: input.interval_ms ?? 60000,
      is_active: input.is_active ?? 1,
      updated_at: now,
    }));
    return (await getPlatformConnector(input.id))!;
  }

  // Ensure FK reference exists in endpoints table
  const exists = await pool.query('SELECT 1 FROM endpoints WHERE id = $1', [id]);
  if (exists.rows.length === 0) {
    await pool.query(q(`
      INSERT INTO endpoints (id, name, url, api_key, is_active, created_at)
      VALUES (@id, @name, @url, @api_key, @is_active, @created_at)
    `, {
      id,
      name: `${input.name} (Connector)`,
      url: input.api_url,
      api_key: `connector_${id}`,
      is_active: 1,
      created_at: now,
    }));
  }

  await pool.query(q(`
    INSERT INTO platform_connectors (id, name, platform_type, api_url, auth_header, auth_token, json_path, interval_ms, is_active, created_at, updated_at)
    VALUES (@id, @name, @platform_type, @api_url, @auth_header, @auth_token, @json_path, @interval_ms, @is_active, @created_at, @updated_at)
  `, {
    id,
    name: input.name,
    platform_type: input.platform_type,
    api_url: input.api_url,
    auth_header: input.auth_header ?? null,
    auth_token: input.auth_token ?? null,
    json_path: input.json_path ?? null,
    interval_ms: input.interval_ms ?? 60000,
    is_active: input.is_active ?? 1,
    created_at: now,
    updated_at: now,
  }));

  return (await getPlatformConnector(id))!;
}

export async function deletePlatformConnector(id: string): Promise<void> {
  await ensureMigrated();
  await pool.query('DELETE FROM platform_connectors WHERE id = $1', [id]);
  await pool.query('DELETE FROM endpoints WHERE id = $1', [id]);
}

// ──── Data Retention ──────────────────────────────────────────────────

export async function pruneOldRuns(retentionDays: number): Promise<number> {
  await ensureMigrated();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const r = await pool.query('DELETE FROM runs WHERE generated_at < $1', [cutoff]);
  return r.rowCount ?? 0;
}

// ──── BotCake Manual Overrides ───────────────────────────────────────

export type BotCakeOverride = {
  page_id: string;
  is_active: boolean;
  reason: string;
  created_at: string;
};

export async function getBotCakeOverrides(): Promise<Map<string, BotCakeOverride>> {
  const raw = await getSetting('botcake_overrides');
  if (!raw) return new Map();
  try {
    const arr = JSON.parse(raw) as BotCakeOverride[];
    return new Map(arr.map(o => [o.page_id, o]));
  } catch {
    return new Map();
  }
}

export async function setBotCakeOverride(pageId: string, isActive: boolean, reason: string): Promise<void> {
  const overrides = await getBotCakeOverrides();
  overrides.set(pageId, { page_id: pageId, is_active: isActive, reason, created_at: new Date().toISOString() });
  await setSetting('botcake_overrides', JSON.stringify([...overrides.values()]));
}

export async function removeBotCakeOverride(pageId: string): Promise<void> {
  const overrides = await getBotCakeOverrides();
  overrides.delete(pageId);
  await setSetting('botcake_overrides', JSON.stringify([...overrides.values()]));
}

// ──── Settings ─────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  await ensureMigrated();
  const r = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  const row = r.rows[0] as { value: string } | undefined;
  return row ? row.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureMigrated();
  await pool.query(q(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = @value
  `, { key, value }));
}
