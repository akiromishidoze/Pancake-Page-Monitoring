import { Pool } from 'pg';
import { parse } from 'pg-connection-string';
import { createLogger } from './logger';

const log = createLogger('db');

const connectionString = process.env.DATABASE_URL || '';
const parsed = parse(connectionString);
const isPgBouncer = process.env.PGBOUNCER === 'true';
if (isPgBouncer) log.info('PgBouncer mode enabled');
const pool = new Pool({
  host: parsed.host || '/var/run/postgresql',
  port: parsed.port ? parseInt(String(parsed.port), 10) : undefined,
  database: parsed.database || undefined,
  user: parsed.user || process.env.USER || undefined,
  password: parsed.password || undefined,
  ssl: parsed.ssl === true || parsed.ssl === 'true' ? { rejectUnauthorized: false } : (parsed.ssl ? { rejectUnauthorized: false } : undefined),
  max: isPgBouncer ? 5 : 20,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  pgbouncer: isPgBouncer || undefined,
} as any);

// Log connection errors without crashing
pool.on('error', (err) => {
  log.error({ err: err.message }, 'unexpected pool error');
});
export { pool };

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
      token_expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      endpoint_id TEXT REFERENCES endpoints(id) ON DELETE SET NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      heartbeat_ok BOOLEAN,
      run_quality TEXT,
      severity TEXT,
      canary_status TEXT,
      canary_alert BOOLEAN,
      outage_suspected BOOLEAN,
      alert_count INTEGER,
      rule_version INTEGER,
      in_maintenance_window BOOLEAN,
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
      is_activated BOOLEAN,
      is_canary BOOLEAN,
      activation_reason TEXT,
      state_change TEXT,
      activity_kind_change TEXT,
      hours_since_last_order REAL,
      hours_since_last_customer_activity REAL,
      response_ms REAL,
      fetch_errors INTEGER,
      customer_count INTEGER,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS platform_connectors_active ON platform_connectors(is_active);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS botcake_overrides (
      page_id TEXT PRIMARY KEY,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      reason TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      detail TEXT,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audit_log_created_at ON audit_log(created_at DESC);
    `);
  try { await pool.query(`ALTER TABLE page_states ADD COLUMN IF NOT EXISTS customer_count INTEGER`); } catch {
    // Column may already exist, safe to ignore
  }
  try { await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'`); } catch {
    // Column may already exist, safe to ignore
  }
  await migrateTimestampTypes();
  await migrateBooleanTypes();
  await migrateBotCakeOverrides();
}

async function migrateTimestampTypes() {
  const conversions: { table: string; column: string }[] = [
    { table: 'endpoints', column: 'token_expires_at' },
    { table: 'endpoints', column: 'created_at' },
    { table: 'endpoints', column: 'last_used_at' },
    { table: 'runs', column: 'generated_at' },
    { table: 'runs', column: 'received_at' },
    { table: 'platform_pages', column: 'created_at' },
    { table: 'platform_pages', column: 'updated_at' },
    { table: 'platform_connectors', column: 'created_at' },
    { table: 'platform_connectors', column: 'updated_at' },
    { table: 'sessions', column: 'created_at' },
    { table: 'sessions', column: 'expires_at' },
  ];
  for (const { table, column } of conversions) {
    try {
      await pool.query(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TIMESTAMPTZ USING ${column}::timestamptz`,
      );
    } catch {
      // Column may already be TIMESTAMPTZ or not exist — skip
    }
  }
}

async function migrateBooleanTypes() {
  const conversions: { table: string; column: string }[] = [
    { table: 'endpoints', column: 'is_active' },
    { table: 'runs', column: 'heartbeat_ok' },
    { table: 'runs', column: 'canary_alert' },
    { table: 'runs', column: 'outage_suspected' },
    { table: 'runs', column: 'in_maintenance_window' },
    { table: 'page_states', column: 'is_activated' },
    { table: 'page_states', column: 'is_canary' },
    { table: 'platform_pages', column: 'is_active' },
    { table: 'platform_connectors', column: 'is_active' },
  ];
  for (const { table, column } of conversions) {
    try {
      await pool.query(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE BOOLEAN USING ${column}::boolean`,
      );
    } catch {
      // Column may already be BOOLEAN or not exist — skip
    }
  }
}

let _migrated = false;
async function ensureMigrated() {
  if (_migrated) return;
  _migrated = true;
  await migrate();
  await migratePageStatesPartitioning();
  await migratePartitionColumnTypes();
}

// ──── Partitioning ──────────────────────────────────────────────────────

async function migratePageStatesPartitioning() {
  // Already partitioned — nothing to do
  const check = await pool.query(
    `SELECT relkind FROM pg_class WHERE relname = 'page_states' AND relkind = 'p'`,
  );
  if (check.rows.length > 0) return;

  // If page_states_old exists from a prior failed migration, it contains the real data.
  // Recover it by dropping the empty page_states (created by CREATE TABLE IF NOT EXISTS in migrate())
  // and renaming page_states_old back.
  const oldExists = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM pg_class WHERE relname = 'page_states_old'`,
  );
  if (oldExists.rows[0].cnt > 0) {
    const dataCheck = await pool.query('SELECT COUNT(*)::int AS cnt FROM page_states_old');
    if (dataCheck.rows[0].cnt > 0) {
      // page_states_old has data — recover it
      await pool.query('DROP TABLE IF EXISTS page_states CASCADE');
      await pool.query('ALTER TABLE page_states_old RENAME TO page_states');
      log.info('recovered page_states data from page_states_old');
      // Now check again if partitioning is needed
      const checkAgain = await pool.query(
        `SELECT relkind FROM pg_class WHERE relname = 'page_states' AND relkind = 'p'`,
      );
      if (checkAgain.rows.length > 0) return;
    } else {
      // page_states_old is empty, safe to drop
      await pool.query('DROP TABLE IF EXISTS page_states_old CASCADE');
    }
  }

  await pool.query('BEGIN');
  try {
    await pool.query('ALTER TABLE page_states RENAME TO page_states_old');

    await pool.query(`
      CREATE TABLE page_states (
        id SERIAL,
        run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        page_id TEXT NOT NULL,
        shop_label TEXT,
        page_name TEXT,
        activity_kind TEXT,
        is_activated BOOLEAN,
        is_canary BOOLEAN,
        activation_reason TEXT,
        state_change TEXT,
        activity_kind_change TEXT,
        hours_since_last_order REAL,
        hours_since_last_customer_activity REAL,
        response_ms REAL,
        fetch_errors INTEGER,
        customer_count INTEGER,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (generated_at, id)
      ) PARTITION BY RANGE (generated_at)
    `);

    await ensureMonthlyPartitions();

    await pool.query(`
      INSERT INTO page_states (id, run_id, page_id, shop_label, page_name, activity_kind,
        is_activated, is_canary, activation_reason, state_change, activity_kind_change,
        hours_since_last_order, hours_since_last_customer_activity, response_ms, fetch_errors,
        customer_count, generated_at)
      SELECT id, run_id, page_id, shop_label, page_name, activity_kind,
        is_activated, is_canary, activation_reason, state_change, activity_kind_change,
        hours_since_last_order, hours_since_last_customer_activity, response_ms, fetch_errors,
        customer_count, generated_at
      FROM page_states_old
    `);

    await pool.query('DROP TABLE page_states_old');

    await pool.query('CREATE INDEX IF NOT EXISTS page_states_page_id_time ON page_states(page_id, generated_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS page_states_run_id ON page_states(run_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS page_states_kind_time ON page_states(activity_kind, generated_at DESC)');

    await pool.query(`SELECT setval(pg_get_serial_sequence('page_states', 'id'), COALESCE((SELECT MAX(id) FROM page_states), 1))`);

    await pool.query('COMMIT');
    log.info('page_states migrated to partitioned table');
  } catch (e) {
    await pool.query('ROLLBACK');
    log.error({ err: e }, 'partitioning migration failed, reverting:');
    throw e;
  }
}

async function migratePartitionColumnTypes() {
  try {
    await pool.query(`ALTER TABLE page_states ALTER COLUMN is_activated TYPE BOOLEAN USING is_activated::boolean`);
  } catch {
    // Already BOOLEAN or column doesn't exist
  }
  try {
    await pool.query(`ALTER TABLE page_states ALTER COLUMN is_canary TYPE BOOLEAN USING is_canary::boolean`);
  } catch {
    // Already BOOLEAN or column doesn't exist
  }
}

let _partitionCache: Set<string> | null = null;

export async function ensureMonthlyPartitions(): Promise<void> {
  await ensureMigrated();

  if (!_partitionCache) {
    const partitions = await pool.query(
      `SELECT inhrelid::regclass::text AS name FROM pg_inherits
       WHERE inhparent = 'page_states'::regclass`,
    );
    _partitionCache = new Set(partitions.rows.map((r: { name: string }) => r.name));
  }

  const now = new Date();
  for (let offset = -3; offset <= 6; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const dNext = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const name = `page_states_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (_partitionCache.has(name)) continue;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${name} PARTITION OF page_states
      FOR VALUES FROM ('${d.toISOString().slice(0, 10)}') TO ('${dNext.toISOString().slice(0, 10)}')
    `);
    _partitionCache.add(name);
  }
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
  heartbeat_ok: boolean | null;
  run_quality: string | null;
  severity: string | null;
  canary_status: string | null;
  canary_alert: boolean | null;
  outage_suspected: boolean | null;
  alert_count: number | null;
  rule_version: number | null;
  in_maintenance_window: boolean | null;
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
  is_activated: boolean | null;
  is_canary: boolean | null;
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
  await ensureMonthlyPartitions();
  const existing = await pool.query('SELECT 1 FROM runs WHERE run_id = $1', [input.run_id]);
  if (existing.rows.length > 0) return { inserted: false };

  const allPages = [
    ...input.active_pages.map(p => ({
      ...p,
      _is_active: true,
      response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
      fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : p.fetch_failed ? 1 : 0),
    })),
    ...input.inactive_pages.map(p => ({
      ...p,
      _is_active: false,
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
      heartbeat_ok: input.heartbeat_ok,
      run_quality: input.run_quality,
      severity: input.severity,
      canary_status: input.canary_status,
      canary_alert: input.canary_alert,
      outage_suspected: input.outage_suspected,
      alert_count: input.alert_count,
      rule_version: input.rule_version,
      in_maintenance_window: input.in_maintenance_window,
      total_pages: input.total_pages,
      active_pages: input.active_pages_count,
      inactive_pages: input.inactive_pages_count,
      receiver_sd_size_bytes: input.receiver_sd_size_bytes,
      raw_summary: JSON.stringify(input.raw_summary),
    }));

    if (allPages.length > 0) {
      const cols = ['run_id', 'page_id', 'shop_label', 'page_name', 'activity_kind', 'is_activated',
        'is_canary', 'activation_reason', 'state_change', 'activity_kind_change',
        'hours_since_last_order', 'hours_since_last_customer_activity', 'response_ms', 'fetch_errors', 'generated_at', 'customer_count'];
      const values: unknown[] = [];
      const rows: string[] = [];
      let idx = 1;
      for (const p of allPages) {
        const placeholders = cols.map(() => `$${idx++}`).join(', ');
        rows.push(`(${placeholders})`);
        values.push(
          input.run_id,
          p.page_id ?? p.id ?? '',
          p.shop_label ?? p.shop ?? null,
          p.name ?? null,
          p.activity_kind ?? p.kind ?? null,
          p._is_active,
          p.is_canary ?? false,
          p.activation_reason ?? p.reason ?? null,
          p.state_change ?? null,
          p.activity_kind_change ?? null,
          p.last_order_at
            ? (new Date(input.generated_at).getTime() - new Date(p.last_order_at).getTime()) / (1000 * 60 * 60)
            : null,
          p.last_customer_activity_at
            ? (new Date(input.generated_at).getTime() - new Date(p.last_customer_activity_at).getTime()) / (1000 * 60 * 60)
            : null,
          p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
          typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : null),
          input.generated_at,
          p.customer_count ?? null,
        );
      }
      await client.query(
        `INSERT INTO page_states (${cols.join(', ')}) VALUES ${rows.join(', ')}`,
        values,
      );
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
  const r = await pool.query('SELECT * FROM runs WHERE endpoint_id = $1 ORDER BY generated_at DESC LIMIT $2', [endpointId, limit]);
  return r.rows as RunRow[];
}

export async function getRunHistories(endpointIds: string[], limit = 100): Promise<Map<string, RunRow[]>> {
  await ensureMigrated();
  if (endpointIds.length === 0) return new Map();
  const placeholders = endpointIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await pool.query(`
    SELECT * FROM runs WHERE endpoint_id IN (${placeholders})
    ORDER BY endpoint_id, generated_at DESC
  `, endpointIds);
  const map = new Map<string, RunRow[]>();
  for (const row of r.rows as RunRow[]) {
    const arr = map.get(row.endpoint_id!) ?? [];
    if (arr.length < limit) arr.push(row);
    map.set(row.endpoint_id!, arr);
  }
  return map;
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
    SELECT r1.run_id FROM runs r1
    INNER JOIN (
      SELECT endpoint_id, MAX(generated_at) AS max_gen
      FROM runs
      WHERE endpoint_id != 'botcake-platform' AND endpoint_id IS NOT NULL
      AND (active_pages > 0 OR active_pages IS NULL)
      GROUP BY endpoint_id
    ) r2 ON r1.endpoint_id = r2.endpoint_id AND r1.generated_at = r2.max_gen
  `);
  return (r.rows as { run_id: string }[]).map(r => r.run_id);
}

export async function getPancakeActivePageIds(): Promise<Set<string>> {
  const latestRunIds = await latestGoodRunIds();
  if (latestRunIds.length === 0) return new Set<string>();
  const placeholders = latestRunIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await pool.query(`SELECT page_id FROM page_states WHERE run_id IN (${placeholders}) AND is_activated IS TRUE`, latestRunIds);
  return new Set((r.rows as { page_id: string }[]).map(r => r.page_id));
}

export async function getLatestPageStatesForEndpoints(endpointIds: string[]): Promise<PageStateRow[]> {
  await ensureMigrated();
  if (endpointIds.length === 0) return [];
  const placeholders = endpointIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await pool.query(`
    WITH latest AS (
      SELECT endpoint_id, MAX(generated_at) AS max_gen
      FROM runs
      WHERE endpoint_id IN (${placeholders})
      GROUP BY endpoint_id
    )
    SELECT ps.* FROM page_states ps
    JOIN runs r ON r.run_id = ps.run_id
    JOIN latest ON r.endpoint_id = latest.endpoint_id
      AND r.generated_at = latest.max_gen
      AND ps.generated_at::timestamptz >= latest.max_gen
    ORDER BY ps.shop_label, ps.page_name
  `, endpointIds);
  return r.rows as PageStateRow[];
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
      AND ps.generated_at::timestamptz >= (SELECT generated_at FROM runs WHERE endpoint_id = $2 ORDER BY generated_at DESC LIMIT 1)
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
        AND ps.generated_at::timestamptz >= (SELECT generated_at FROM runs WHERE endpoint_id IS NULL ORDER BY generated_at DESC LIMIT 1)
        ORDER BY ps.page_name
      `, [ep.shop_label]);
      return r2.rows as PageStateRow[];
    }
    return [];
  }
  const r = await pool.query(`
    WITH latest AS (
      SELECT run_id, generated_at FROM runs
      WHERE endpoint_id IS NULL OR endpoint_id != 'botcake-platform'
      ORDER BY generated_at DESC LIMIT 1
    )
    SELECT ps.* FROM page_states ps
    JOIN latest ON ps.run_id = latest.run_id AND ps.generated_at::timestamptz >= latest.generated_at
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
  is_active: boolean;
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

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
}

export async function getEndpointBySlug(slug: string): Promise<EndpointRow | undefined> {
  const all = await listEndpoints();
  return all.find(e => slugify(e.name) === slug);
}

export async function getEndpointByApiKey(apiKey: string): Promise<EndpointRow | undefined> {
  await ensureMigrated();
  const r = await pool.query('SELECT * FROM endpoints WHERE api_key = $1 AND is_active IS TRUE', [apiKey]);
  return r.rows[0] as EndpointRow | undefined;
}

export async function upsertEndpoint(input: {
  id?: string;
  name: string;
  url?: string | null;
  api_key: string;
  access_token?: string | null;
  token_expires_at?: string | null;
  is_active?: boolean;
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
      is_active: input.is_active ?? true,
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
    is_active: input.is_active ?? true,
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
  is_active: boolean;
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
  is_active?: boolean;
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
      is_active: input.is_active ?? true,
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
    is_active: input.is_active ?? true,
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
  is_active: boolean;
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
  is_active?: boolean;
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
      is_active: input.is_active ?? true,
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
    is_active: input.is_active ?? true,
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
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString();

  const r = await pool.query('DELETE FROM runs WHERE generated_at < $1', [cutoffStr]);

  // Drop now-empty old partitions (space reclamation — cascade already cleaned data)
  const partitions = await pool.query(
    `SELECT inhrelid::regclass::text AS name FROM pg_inherits
     WHERE inhparent = 'page_states'::regclass`,
  );
  const cutoffMonth = new Date(cutoff.getFullYear(), cutoff.getMonth(), 1);
  for (const row of partitions.rows as { name: string }[]) {
    const m = row.name.match(/page_states_(\d{4})_(\d{2})$/);
    if (m) {
      const partDate = new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1);
      if (partDate < cutoffMonth) {
        await pool.query(`DROP TABLE IF EXISTS ${row.name}`);
      }
    }
  }
  return r.rowCount ?? 0;
}

// ──── BotCake Manual Overrides ───────────────────────────────────────

export type BotCakeOverride = {
  page_id: string;
  is_active: boolean;
  reason: string;
  created_at: string;
};

async function migrateBotCakeOverrides() {
  const raw = await getSetting('botcake_overrides');
  if (!raw) return;
  try {
    const arr = JSON.parse(raw) as BotCakeOverride[];
    if (arr.length === 0) return;
    for (const o of arr) {
      await pool.query(
        `INSERT INTO botcake_overrides (page_id, is_active, reason, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (page_id) DO NOTHING`,
        [o.page_id, o.is_active, o.reason, o.created_at],
      );
    }
    // Clear the old JSON blob from settings
    await setSetting('botcake_overrides', '');
    log.info(`migrated ${arr.length} botcake overrides from settings to botcake_overrides table`);
  } catch {
    // If migration fails, leave old data in settings for manual recovery
  }
}

export async function getBotCakeOverrides(): Promise<Map<string, BotCakeOverride>> {
  await ensureMigrated();
  const r = await pool.query(
    'SELECT page_id, is_active, reason, created_at FROM botcake_overrides ORDER BY created_at DESC',
  );
  const rows = r.rows as BotCakeOverride[];
  return new Map(rows.map(o => [o.page_id, o]));
}

export async function setBotCakeOverride(pageId: string, isActive: boolean, reason: string): Promise<void> {
  await ensureMigrated();
  await pool.query(
    `INSERT INTO botcake_overrides (page_id, is_active, reason, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (page_id) DO UPDATE SET is_active = $2, reason = $3, created_at = NOW()`,
    [pageId, isActive, reason],
  );
}

export async function removeBotCakeOverride(pageId: string): Promise<void> {
  await ensureMigrated();
  await pool.query('DELETE FROM botcake_overrides WHERE page_id = $1', [pageId]);
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

// ──── Audit Log ────────────────────────────────────────────────────────

export async function logAuditEntry(action: string, entityType?: string, entityId?: string, detail?: string, ipAddress?: string): Promise<void> {
  await ensureMigrated();
  try {
    await pool.query(q(`
      INSERT INTO audit_log (action, entity_type, entity_id, detail, ip_address)
      VALUES (@action, @entityType, @entityId, @detail, @ipAddress)
    `, { action, entityType: entityType ?? null, entityId: entityId ?? null, detail: detail ?? null, ipAddress: ipAddress ?? null }));
  } catch (e) {
    log.error({ err: e }, 'failed to log audit entry');
  }
}

// ──── Sessions ─────────────────────────────────────────────────────────

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSessionToken(role?: string): Promise<string> {
  await ensureMigrated();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await pool.query(
    'INSERT INTO sessions (token, role, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [token, role || 'admin', now, expires],
  );
  // Prune expired sessions on each new login (lazy cleanup)
  void pruneExpiredSessions();
  return token;
}

export async function getSessionRole(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  await ensureMigrated();
  const r = await pool.query('SELECT role FROM sessions WHERE token = $1', [token]);
  const row = r.rows[0] as { role: string } | undefined;
  return row ? row.role : null;
}

export async function requireAdminSession(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const role = await getSessionRole(token);
  return role === 'admin';
}

export async function validateSessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  await ensureMigrated();
  const r = await pool.query(
    'SELECT expires_at FROM sessions WHERE token = $1',
    [token],
  );
  const row = r.rows[0] as { expires_at: string } | undefined;
  if (!row) return false;
  return new Date(row.expires_at) > new Date();
}

export async function clearSessionToken(token: string): Promise<void> {
  await ensureMigrated();
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function pruneExpiredSessions(): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE expires_at < $1', [new Date().toISOString()]);
}

