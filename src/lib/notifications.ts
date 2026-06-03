import { queryRows, queryRow } from './db';
import { createLogger } from './logger';

const log = createLogger('notifications');

export type NotificationType =
  | 'internal_error'
  | 'external_error'
  | 'credential_change'
  | 'run_error'
  | 'down_page'
  | 'csv_export'
  | 'token_expiring'
  | 'maintenance'
  | 'platform_added'
  | 'connector_added'
  | 'canary_down'
  | 'outage_suspected'
  | 'alert_triggered'
  | 'retention_nearing';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type NotificationRow = {
  id: number;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

export async function addNotification(
  type: NotificationType,
  severity: NotificationSeverity,
  title: string,
  message?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await queryRows(
      `INSERT INTO notifications (type, severity, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [type, severity, title, message ?? null, metadata ?? {}],
    );
  } catch (e) {
    log.warn({ err: e }, 'failed to add notification');
  }
}

export async function getNotifications(
  limit: number = 50,
  offset: number = 0,
  unreadOnly?: boolean,
): Promise<NotificationRow[]> {
  if (unreadOnly) {
    return queryRows<NotificationRow>(
      'SELECT * FROM notifications WHERE is_read = false ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );
  }
  return queryRows<NotificationRow>(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );
}

export async function getUnreadCount(): Promise<number> {
  const row = await queryRow<{ count: string }>(
    'SELECT COUNT(*) as count FROM notifications WHERE is_read = false',
  );
  return row ? parseInt(row.count, 10) : 0;
}

export async function markAsRead(id: number): Promise<void> {
  await queryRows('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
}

export async function markAllAsRead(): Promise<void> {
  await queryRows('UPDATE notifications SET is_read = true WHERE is_read = false', []);
}

export async function dismissNotification(id: number): Promise<void> {
  await queryRows('DELETE FROM notifications WHERE id = $1', [id]);
}

export async function pruneNotifications(retentionDays: number = 30): Promise<number> {
  let deleted = 0;
  try {
    const result = await queryRow<{ count: string }>(
      'WITH deleted AS (DELETE FROM notifications WHERE created_at < NOW() - INTERVAL \'1 day\' * $1 RETURNING 1) SELECT COUNT(*)::text as count FROM deleted',
      [retentionDays],
    );
    deleted = result ? parseInt(result.count, 10) : 0;
  } catch (e) {
    log.warn({ err: e }, 'failed to prune notifications');
  }
  if (deleted > 0) log.info('pruned %d notifications older than %d days', deleted, retentionDays);
  return deleted;
}
