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
}
