import { registerOTel } from '@vercel/otel';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { createLogger } from '@/lib/logger';
const log = createLogger('startup');

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  registerOTel({
    serviceName: 'page-monitor',
    instrumentations: [
      new PgInstrumentation(),
    ],
  });

  if (!process.env['DATABASE_URL']) {
    log.error('MISSING REQUIRED ENV VAR: DATABASE_URL');
    throw new Error('DATABASE_URL is required');
  }

  if (!process.env['FB_ACCESS_TOKEN']) {
    log.warn('Optional env var FB_ACCESS_TOKEN is not set');
  }

  if (process.env['INGEST_IP_ALLOWLIST']) {
    log.info('INGEST_IP_ALLOWLIST is set — ingest restricted to allowed IPs');
  }

  if (!process.env['ENCRYPTION_KEY']) {
    log.warn('ENCRYPTION_KEY not set — falling back to DATABASE_URL for encryption key derivation. Set ENCRYPTION_KEY explicitly to avoid re-encryption if DATABASE_URL changes.');
  }

  if (process.env['ALLOWED_ORIGINS']) {
    log.info('ALLOWED_ORIGINS set — CORS restricted to: %s', process.env['ALLOWED_ORIGINS']);
  } else {
    log.warn('ALLOWED_ORIGINS not set — cross-origin browser requests will be rejected. Set it to your dashboard domain for production.');
  }

  if (process.env['PGBOUNCER'] === 'true') {
    log.info('PGBOUNCER enabled — using pgBouncer-compatible pool settings');
  }

  if (process.env['LOG_LEVEL']) {
    const valid = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    if (!valid.includes(process.env['LOG_LEVEL'])) {
      log.warn('LOG_LEVEL="%s" is not a valid level; expected one of: %s', process.env['LOG_LEVEL'], valid.join(', '));
    }
  }

  if (process.env['NODE_ENV'] !== 'production') {
    log.warn('NODE_ENV is not set to "production" — cookies will not use the secure flag, and logs will use pretty-print transport');
  }

  if (process.env['S3_BUCKET']) {
    if (!process.env['AWS_REGION']) {
      log.warn('S3_BUCKET is set but AWS_REGION is missing — S3 backups will fail');
    } else {
      log.info('S3_BUCKET set — remote backups enabled to s3://%s/%s', process.env['S3_BUCKET'], process.env['S3_PREFIX'] || '');
    }
  }

  if (process.env['SSE_MAX_CLIENTS']) {
    log.info('SSE_MAX_CLIENTS set — max concurrent SSE connections: %s', process.env['SSE_MAX_CLIENTS']);
  }

  if (process.env['PG_STATEMENT_TIMEOUT']) {
    log.info('PG_STATEMENT_TIMEOUT set — statement timeout: %sms', process.env['PG_STATEMENT_TIMEOUT']);
  }

  if (process.env['WEBHOOK_SECRET']) {
    log.info('WEBHOOK_SECRET set — webhook endpoints require secret header');
  }

  const { initHttpAgent } = await import('./lib/http');
  initHttpAgent();

  // Catch unhandled rejections from poller/scheduler to prevent process crashes
  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason instanceof Error ? reason : String(reason) }, 'unhandledRejection');
  });

  setTimeout(async () => {
    try {
      const [{ ensureCredentials }, { startScheduler }] = await Promise.all([
        import('./lib/auth'),
        import('./lib/scheduler'),
      ]);
      await ensureCredentials();
      startScheduler();
    } catch (err) {
      log.error({ err }, 'background workers failed');
    }
  }, 10_000);

  // ── Graceful shutdown on SIGTERM/SIGINT ──────────────────────────────
  let _shuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    log.info('received %s — shutting down gracefully…', signal);

    // Safety timeout: force exit if cleanup takes too long
    // PM2 kill_timeout is 10s, so we use 8s to stay under that
    const forceTimer = setTimeout(() => {
      log.warn('graceful shutdown timed out after 8s — forcing exit');
      process.exit(1);
    }, 8_000);
    forceTimer.unref();

    try {
      const { stopPoller } = await import('./lib/poller');
      stopPoller();
      log.info('poller stopped');
    } catch (err) {
      log.error({ err }, 'error stopping poller');
    }

    try {
      const { stopScheduler } = await import('./lib/scheduler');
      stopScheduler();
      log.info('scheduler stopped');
    } catch (err) {
      log.error({ err }, 'error stopping scheduler');
    }

    try {
      const { stopConnectorPollers } = await import('./lib/connector-poller');
      stopConnectorPollers();
      log.info('connector pollers stopped');
    } catch (err) {
      log.error({ err }, 'error stopping connector pollers');
    }

    try {
      const { stopEviction } = await import('./lib/sse');
      stopEviction();
      log.info('SSE eviction stopped');
    } catch (err) {
      log.error({ err }, 'error stopping SSE eviction');
    }

    try {
      const { pool } = await import('./lib/db');
      await pool.end();
      log.info('DB pool closed');
    } catch (err) {
      log.error({ err }, 'error closing DB pool');
    }

    log.info('graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
