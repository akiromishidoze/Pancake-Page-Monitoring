export type LatestHealth = {
  captured_at: string;
  run_id: string | null;
  canary_status: 'ok' | 'down' | 'no_canary' | null;
  canary_alert: boolean;
  run_quality: 'full' | 'partial' | 'degraded' | null;
  severity: 'critical' | 'high' | 'info' | null;
  outage_suspected: boolean;
  alert_count: number;
  rule_version: number | null;
  in_maintenance_window: boolean;
  static_data_size_mb?: number | null;
  e2e_pancake_active_botcake_inactive: number;
  fetch_errors_orders: number;
  fetch_errors_customers: number;
};

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
};

export type ShopBreakdown = {
  active: number;
  inactive: number;
  total: number;
  kinds: {
    funnel_converting: number;
    direct_orders_only: number;
    chat_only: number;
    none: number;
  };
};

export type StatusResponse = {
  ok: boolean;
  status: 'fresh' | 'stale';
  last_heartbeat_at: string | null;
  last_heartbeat_run_id: string | null;
  age_minutes: number | null;
  threshold_minutes: number;
  runs_received_total: number;
  last_backup_at: string | null;
  last_backup_run_id: string | null;
  latest_health: LatestHealth | null;
  receiver_sd_size_bytes: number | null;
  last_backup_rejected: boolean;
  last_backup_rejected_at: string | null;
  last_backup_rejected_size_bytes: number | null;
  totals?: { total: number; active: number; inactive: number } | null;
  by_shop?: Record<string, ShopBreakdown> | null;
  active_pages?: SlimPage[];
  inactive_pages?: SlimPage[];
  page_lists_captured_at?: string | null;
  page_lists_run_id?: string | null;
  generated_at: string;
};

export type FetchResult =
  | { ok: true; data: StatusResponse }
  | { ok: false; error: string; status?: number };
