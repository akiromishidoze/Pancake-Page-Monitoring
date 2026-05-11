// SQLite client for the dashboard. File lives at ./data/monitor.sqlite.
// Schema is migrated on first import (idempotent).
//
// Tables:
//   runs        — one row per snapshot received from the n8n receiver
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
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ──── Types ────────────────────────────────────────────────────────────

export type SlimPage = {
  shop?: string;
  shop_label?: string;
  name: string;
  page_id?: string;
  id?: string;
  kind?: string | null;
  activity_kind?: string | null;
  reason?: string | null;
  activation_reason?: string | null;
  last_order_at?: string | null;
  last_customer_activity_at?: string | null;
  state_change?: string | null;
  activity_kind_change?: string | null;
  is_canary?: boolean;
};

export type RunRow = {
  run_id: string;
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
};

export function insertSnapshot(input: InsertSnapshotInput): { inserted: boolean } {
  const db = getDb();

  // Idempotency: skip if run_id already stored
  const existing = db.prepare('SELECT 1 FROM runs WHERE run_id = ?').get(input.run_id);
  if (existing) return { inserted: false };

  const insertRun = db.prepare(`
    INSERT INTO runs (
      run_id, generated_at, received_at, heartbeat_ok, run_quality, severity,
      canary_status, canary_alert, outage_suspected, alert_count, rule_version,
      in_maintenance_window, total_pages, active_pages, inactive_pages,
      receiver_sd_size_bytes, raw_summary
    ) VALUES (
      @run_id, @generated_at, @received_at, @heartbeat_ok, @run_quality, @severity,
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
        response_ms: (p as any).response_ms ?? (p as any).response_time_ms ?? (p as any).latency_ms ?? (p as any).fetch_latency_ms ?? null,
        fetch_errors: typeof (p as any).fetch_errors === 'number' ? (p as any).fetch_errors : (typeof (p as any).fetch_error_count === 'number' ? (p as any).fetch_error_count : (p as any).fetch_failed ? 1 : 0),
      })),
      ...input.inactive_pages.map((p) => ({
        ...p,
        _is_active: 0,
        response_ms: (p as any).response_ms ?? (p as any).response_time_ms ?? (p as any).latency_ms ?? (p as any).fetch_latency_ms ?? null,
        fetch_errors: typeof (p as any).fetch_errors === 'number' ? (p as any).fetch_errors : (typeof (p as any).fetch_error_count === 'number' ? (p as any).fetch_error_count : (p as any).fetch_failed ? 1 : 0),
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
        response_ms: (p as any).response_ms ?? null,
        fetch_errors: typeof (p as any).fetch_errors === 'number' ? (p as any).fetch_errors : (typeof (p as any).fetch_error_count === 'number' ? (p as any).fetch_error_count : null),
        generated_at: input.generated_at,
      });
    }
  });

  insertAll();
  return { inserted: true };
}

// ──── Read helpers ─────────────────────────────────────────────────────

export function getLatestRun(): RunRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM runs ORDER BY generated_at DESC LIMIT 1').get() as
    | RunRow
    | undefined;
}

export function getRecentRuns(limit = 50): RunRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM runs ORDER BY generated_at DESC LIMIT ?')
    .all(limit) as RunRow[];
}

export function getLatestPageStates(): PageStateRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ps.* FROM page_states ps
       JOIN runs r ON r.run_id = ps.run_id
       WHERE r.run_id = (SELECT run_id FROM runs ORDER BY generated_at DESC LIMIT 1)
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

export function getRunCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as c FROM runs').get() as { c: number };
  return row.c;
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
