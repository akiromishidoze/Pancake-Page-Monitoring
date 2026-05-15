// SQLite client for the dashboard. File lives at ./data/monitor.sqlite.
// Schema is migrated on first import (idempotent).
//
// Tables:
//   endpoints   — configured data sources (name, API key, expiration, etc.)
//   runs        — one row per snapshot received from any endpoint
//   page_states — one row per (run × page) for fast per-page queries

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'monitor.sqlite');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  // Migrate existing database: add endpoint_id column if missing
  try {
    db.exec(`ALTER TABLE runs ADD COLUMN endpoint_id TEXT REFERENCES endpoints(id) ON DELETE SET NULL`);
  } catch {
    // column already exists
  }
  try {
    db.exec(`ALTER TABLE endpoints ADD COLUMN access_token TEXT`);
  } catch {
    // column already exists
  }
  try {
    db.exec(`ALTER TABLE endpoints ADD COLUMN shop_label TEXT`);
  } catch {
    // column already exists
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      endpoint_id TEXT,
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
      raw_summary TEXT,
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS runs_endpoint_id_idx ON runs(endpoint_id);
    CREATE INDEX IF NOT EXISTS runs_generated_at_idx ON runs(generated_at DESC);

    CREATE TABLE IF NOT EXISTS page_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
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
      generated_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS page_states_page_id_time ON page_states(page_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS page_states_run_id ON page_states(run_id);
    CREATE INDEX IF NOT EXISTS page_states_kind_time ON page_states(activity_kind, generated_at DESC);

    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      api_key TEXT NOT NULL,
      token_expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_pages (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL,
      page_name TEXT NOT NULL,
      page_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
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

export function insertSnapshot(input: InsertSnapshotInput): { inserted: boolean } {
  const db = getDb();

  // Idempotency: skip if run_id already stored
  const existing = db.prepare('SELECT 1 FROM runs WHERE run_id = ?').get(input.run_id);
  if (existing) return { inserted: false };

  const insertRun = db.prepare(`
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
  `);

  const insertPage = db.prepare(`
    INSERT INTO page_states (
      run_id, page_id, shop_label, page_name, activity_kind, is_activated,
      is_canary, activation_reason, state_change, activity_kind_change,
      hours_since_last_order, hours_since_last_customer_activity, response_ms, fetch_errors, generated_at
    ) VALUES (
      @run_id, @page_id, @shop_label, @page_name, @activity_kind, @is_activated,
      @is_canary, @activation_reason, @state_change, @activity_kind_change,
      @hours_since_last_order, @hours_since_last_customer_activity, @response_ms, @fetch_errors, @generated_at
    )
  `);

  const insertAll = db.transaction(() => {
    insertRun.run({
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
    });

    const allPages = [
      ...input.active_pages.map((p) => ({
        ...p,
        _is_active: 1,
        response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
        fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : p.fetch_failed ? 1 : 0),
      })),
      ...input.inactive_pages.map((p) => ({
        ...p,
        _is_active: 0,
        response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
        fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : p.fetch_failed ? 1 : 0),
      })),
      ...(input.unknown_pages ?? []).map((p) => ({
        ...p,
        _is_active: null,
        response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
        fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : p.fetch_failed ? 1 : 0),
      })),
    ];

    for (const p of allPages) {
      insertPage.run({
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
        hours_since_last_order: null,
        hours_since_last_customer_activity: null,
        response_ms: p.response_ms ?? p.response_time_ms ?? p.latency_ms ?? p.fetch_latency_ms ?? null,
        fetch_errors: typeof p.fetch_errors === 'number' ? p.fetch_errors : (typeof p.fetch_error_count === 'number' ? p.fetch_error_count : null),
        generated_at: input.generated_at,
      });
    }
  });

  insertAll();
  return { inserted: true };
}

// ──── Read helpers ─────────────────────────────────────────────────────

export function getLatestRun(endpointId?: string): RunRow | undefined {
  const db = getDb();
  if (endpointId) {
    return db
      .prepare('SELECT * FROM runs WHERE endpoint_id = ? ORDER BY generated_at DESC LIMIT 1')
      .get(endpointId) as RunRow | undefined;
  }
  return db.prepare('SELECT * FROM runs ORDER BY generated_at DESC LIMIT 1').get() as
    | RunRow
    | undefined;
}

export function getRunHistory(endpointId: string, limit = 100): RunRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM runs WHERE endpoint_id = ? ORDER BY generated_at ASC LIMIT ?')
    .all(endpointId, limit) as RunRow[];
}

export function getRecentRuns(limit = 50, endpointId?: string): RunRow[] {
  const db = getDb();
  if (endpointId) {
    return db
      .prepare('SELECT * FROM runs WHERE endpoint_id = ? ORDER BY generated_at DESC LIMIT ?')
      .all(endpointId, limit) as RunRow[];
  }
  return db
    .prepare('SELECT * FROM runs ORDER BY generated_at DESC LIMIT ?')
    .all(limit) as RunRow[];
}

function latestGoodRunIds(): string[] {
  const db = getDb();
  return (db.prepare(`
    SELECT run_id FROM runs r1
    WHERE endpoint_id != 'botcake-platform' AND endpoint_id IS NOT NULL
    AND (active_pages > 0 OR active_pages IS NULL)
    AND generated_at = (
      SELECT MAX(generated_at) FROM runs r2
      WHERE r2.endpoint_id = r1.endpoint_id
      AND (active_pages > 0 OR active_pages IS NULL)
    )
    GROUP BY endpoint_id
  `).all() as { run_id: string }[]).map(r => r.run_id);
}

export function getPancakeActivePageIds(): Set<string> {
  const latestRunIds = latestGoodRunIds();
  if (latestRunIds.length === 0) return new Set<string>();

  const db = getDb();
  const placeholders = latestRunIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT page_id FROM page_states
    WHERE run_id IN (${placeholders}) AND is_activated = 1
  `).all(...latestRunIds) as { page_id: string }[];
  return new Set(rows.map(r => r.page_id));
}

export function getPancakeSeenEver(): Set<string> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT ps.page_id
    FROM page_states ps
    JOIN runs r ON r.run_id = ps.run_id
    WHERE r.endpoint_id != 'botcake-platform' AND r.endpoint_id IS NOT NULL
  `).all() as { page_id: string }[];
  return new Set(rows.map(r => r.page_id));
}

export function getPancakeInactivePageIds(): Set<string> {
  const active = getPancakeActivePageIds();
  const latestRunIds = latestGoodRunIds();
  if (latestRunIds.length === 0) return new Set<string>();

  const db = getDb();
  const placeholders = latestRunIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT DISTINCT page_id FROM page_states
    WHERE run_id IN (${placeholders}) AND (is_activated = 0 OR is_activated IS NULL)
  `).all(...latestRunIds) as { page_id: string }[];
  const result = new Set<string>();
  for (const r of rows) {
    if (!active.has(r.page_id)) result.add(r.page_id);
  }
  return result;
}

export function getLatestPageStates(endpointId?: string): PageStateRow[] {
  const db = getDb();
  if (endpointId) {
    const endpoint = endpointId ? getEndpoint(endpointId) : undefined;

    const rows = db
      .prepare(
        `SELECT ps.* FROM page_states ps
         JOIN runs r ON r.run_id = ps.run_id
         WHERE r.endpoint_id = ?
         AND r.run_id = (SELECT run_id FROM runs WHERE endpoint_id = ? ORDER BY generated_at DESC LIMIT 1)
         ORDER BY ps.shop_label, ps.page_name`,
      )
      .all(endpointId, endpointId) as PageStateRow[];

    if (rows.length > 0) return rows;

    // Fallback: match by shop_label on legacy runs (no endpoint_id)
    if (endpoint?.shop_label) {
      return db
        .prepare(
          `SELECT ps.* FROM page_states ps
           JOIN runs r ON r.run_id = ps.run_id
           WHERE r.endpoint_id IS NULL
           AND ps.shop_label = ?
           AND r.run_id = (SELECT run_id FROM runs WHERE endpoint_id IS NULL ORDER BY generated_at DESC LIMIT 1)
           ORDER BY ps.page_name`,
        )
        .all(endpoint.shop_label) as PageStateRow[];
    }

    return [];
  }
  return db
    .prepare(
      `SELECT ps.* FROM page_states ps
       JOIN runs r ON r.run_id = ps.run_id
       WHERE r.run_id = (
         SELECT run_id FROM runs
         WHERE endpoint_id IS NULL OR endpoint_id != 'botcake-platform'
         ORDER BY generated_at DESC LIMIT 1
       )
       ORDER BY ps.shop_label, ps.page_name`,
    )
    .all() as PageStateRow[];
}

export function getPageHistory(pageId: string, limit = 1000): PageStateRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM page_states
       WHERE page_id = ?
       ORDER BY generated_at ASC
       LIMIT ?`,
    )
    .all(pageId, limit) as PageStateRow[];
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

export function listEndpoints(): EndpointRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM endpoints ORDER BY created_at DESC').all() as EndpointRow[];
}

export function getEndpoint(id: string): EndpointRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id) as EndpointRow | undefined;
}

export function getEndpointByName(name: string): EndpointRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM endpoints WHERE name = ?').get(name) as EndpointRow | undefined;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function getEndpointBySlug(slug: string): EndpointRow | undefined {
  const db = getDb();
  const all = db.prepare('SELECT * FROM endpoints').all() as EndpointRow[];
  return all.find((e) => slugify(e.name) === slug);
}

export function getEndpointByApiKey(apiKey: string): EndpointRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM endpoints WHERE api_key = ? AND is_active = 1').get(apiKey) as EndpointRow | undefined;
}

export function upsertEndpoint(input: {
  id?: string;
  name: string;
  url?: string | null;
  api_key: string;
  access_token?: string | null;
  token_expires_at?: string | null;
  is_active?: number;
}): EndpointRow {
  const db = getDb();
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.id) {
    db.prepare(`
      UPDATE endpoints SET name=@name, url=@url, api_key=@api_key,
        access_token=@access_token, token_expires_at=@token_expires_at, is_active=@is_active
      WHERE id=@id
    `).run({
      id: input.id,
      name: input.name,
      url: input.url ?? null,
      api_key: input.api_key,
      access_token: input.access_token ?? null,
      token_expires_at: input.token_expires_at ?? null,
      is_active: input.is_active ?? 1,
    });
    return getEndpoint(input.id)!;
  }

  db.prepare(`
    INSERT INTO endpoints (id, name, url, api_key, access_token, token_expires_at, is_active, created_at)
    VALUES (@id, @name, @url, @api_key, @access_token, @token_expires_at, @is_active, @created_at)
  `).run({
    id,
    name: input.name,
    url: input.url ?? null,
    api_key: input.api_key,
    access_token: input.access_token ?? null,
    token_expires_at: input.token_expires_at ?? null,
    is_active: input.is_active ?? 1,
    created_at: now,
  });

  return getEndpoint(id)!;
}

export function deleteEndpoint(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM platform_pages WHERE endpoint_id = ?').run(id);
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
}

export function touchEndpoint(id: string): void {
  const db = getDb();
  db.prepare('UPDATE endpoints SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function getPreviousRunActiveCount(endpointId: string): number | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT active_pages FROM runs
    WHERE endpoint_id = ?
    ORDER BY generated_at DESC LIMIT 1 OFFSET 1
  `).get(endpointId) as { active_pages: number } | undefined;
  return row?.active_pages ?? null;
}

export function getRunCount(endpointId?: string): number {
  const db = getDb();
  if (endpointId) {
    const row = db.prepare('SELECT COUNT(*) as c FROM runs WHERE endpoint_id = ?').get(endpointId) as { c: number };
    return row.c;
  }
  const row = db.prepare('SELECT COUNT(*) as c FROM runs').get() as { c: number };
  return row.c;
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

export function listPlatformPages(endpointId?: string): PlatformPageRow[] {
  const db = getDb();
  if (endpointId) {
    return db
      .prepare('SELECT * FROM platform_pages WHERE endpoint_id = ? ORDER BY page_name ASC')
      .all(endpointId) as PlatformPageRow[];
  }
  return db.prepare('SELECT * FROM platform_pages ORDER BY page_name ASC').all() as PlatformPageRow[];
}

export function getPlatformPage(id: string): PlatformPageRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM platform_pages WHERE id = ?').get(id) as PlatformPageRow | undefined;
}

export function upsertPlatformPage(input: {
  id?: string;
  endpoint_id: string;
  page_name: string;
  page_url?: string | null;
  is_active?: number;
}): PlatformPageRow {
  const db = getDb();
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.id) {
    db.prepare(`
      UPDATE platform_pages SET page_name=@page_name, page_url=@page_url,
        is_active=@is_active, updated_at=@updated_at
      WHERE id=@id
    `).run({
      id: input.id,
      page_name: input.page_name,
      page_url: input.page_url ?? null,
      is_active: input.is_active ?? 1,
      updated_at: now,
    });
    return getPlatformPage(input.id)!;
  }

  db.prepare(`
    INSERT INTO platform_pages (id, endpoint_id, page_name, page_url, is_active, created_at, updated_at)
    VALUES (@id, @endpoint_id, @page_name, @page_url, @is_active, @created_at, @updated_at)
  `).run({
    id,
    endpoint_id: input.endpoint_id,
    page_name: input.page_name,
    page_url: input.page_url ?? null,
    is_active: input.is_active ?? 1,
    created_at: now,
    updated_at: now,
  });

  return getPlatformPage(id)!;
}

export function deletePlatformPage(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM platform_pages WHERE id = ?').run(id);
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

export function listPlatformConnectors(): PlatformConnectorRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM platform_connectors ORDER BY name ASC').all() as PlatformConnectorRow[];
}

export function getPlatformConnector(id: string): PlatformConnectorRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM platform_connectors WHERE id = ?').get(id) as PlatformConnectorRow | undefined;
}

export function upsertPlatformConnector(input: {
  id?: string;
  name: string;
  platform_type: string;
  api_url: string;
  auth_header?: string | null;
  auth_token?: string | null;
  json_path?: string | null;
  interval_ms?: number;
  is_active?: number;
}): PlatformConnectorRow {
  const db = getDb();
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.id) {
    db.prepare(`
      UPDATE platform_connectors SET name=@name, platform_type=@platform_type, api_url=@api_url,
        auth_header=@auth_header, auth_token=@auth_token, json_path=@json_path,
        interval_ms=@interval_ms, is_active=@is_active, updated_at=@updated_at
      WHERE id=@id
    `).run({
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
    });
    return getPlatformConnector(input.id)!;
  }

  // Ensure FK reference exists in endpoints table
  const endpointExists = db.prepare('SELECT 1 FROM endpoints WHERE id = ?').get(id);
  if (!endpointExists) {
    db.prepare(`
      INSERT INTO endpoints (id, name, url, api_key, is_active, created_at)
      VALUES (@id, @name, @url, @api_key, @is_active, @created_at)
    `).run({
      id,
      name: `${input.name} (Connector)`,
      url: input.api_url,
      api_key: `connector_${id}`,
      is_active: 1,
      created_at: now,
    });
  }

  db.prepare(`
    INSERT INTO platform_connectors (id, name, platform_type, api_url, auth_header, auth_token, json_path, interval_ms, is_active, created_at, updated_at)
    VALUES (@id, @name, @platform_type, @api_url, @auth_header, @auth_token, @json_path, @interval_ms, @is_active, @created_at, @updated_at)
  `).run({
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
  });

  return getPlatformConnector(id)!;
}

export function deletePlatformConnector(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM platform_connectors WHERE id = ?').run(id);
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
}

// ──── Data Retention ──────────────────────────────────────────────────

export function pruneOldRuns(retentionDays: number): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM runs WHERE generated_at < ?').run(cutoff);
  return result.changes;
}

// ──── Settings ─────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = @value
  `).run({ key, value });
}
