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
    process.exit(1);
  }

  if (!process.env['FB_ACCESS_TOKEN']) {
    log.warn('Optional env var FB_ACCESS_TOKEN is not set');
  }

  const { initHttpAgent } = await import('./lib/http');
  initHttpAgent();

  setTimeout(() => {
    Promise.all([
      import('./lib/auth'),
      import('./lib/poller'),
      import('./lib/scheduler'),
      import('./lib/connector-poller'),
    ]).then(async ([authMod, pollerMod, schedulerMod, connectorMod]) => {
      try {
        await authMod.ensureCredentials();
      } catch (err) {
        log.error({ err }, 'ensureCredentials failed');
      }

      pollerMod.startPoller();
      await schedulerMod.startScheduler();
      connectorMod.startConnectorPollers();

      const shutdown = () => {
        log.info('shutting down...');
        pollerMod.stopPoller();
        schedulerMod.stopScheduler();
        connectorMod.stopConnectorPollers();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }).catch(err => {
      log.error({ err }, 'background workers failed');
    });
  }, 10_000);
}
