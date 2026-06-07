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
    log.error('MISSING REQUIRED ENV VAR: ENCRYPTION_KEY');
    throw new Error('ENCRYPTION_KEY is required — used for AES-256-GCM encryption of SMTP passwords');
  }

  if (process.env['ALLOWED_ORIGINS']) {
    log.info('ALLOWED_ORIGINS set — CORS restricted to: %s', process.env['ALLOWED_ORIGINS']);
  } else {
    log.warn('ALLOWED_ORIGINS not set — CORS allows all origins (*). Set it for production.');
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
