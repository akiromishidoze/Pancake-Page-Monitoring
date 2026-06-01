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
    log.warn('ENCRYPTION_KEY is not set — SMTP passwords will not be encryptable. Set it if you use email notifications.');
  }

  const { initHttpAgent } = await import('./lib/http');
  initHttpAgent();

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
