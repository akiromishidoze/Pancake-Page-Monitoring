// Next.js instrumentation hook — runs once when the server starts.
// We use it to start the background poller worker and initialize auth.
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

const REQUIRED_ENV_VARS = ['DATABASE_URL'] as const;
const OPTIONAL_ENV_VARS = ['FB_ACCESS_TOKEN'] as const;

function validateEnvVars() {
  for (const name of REQUIRED_ENV_VARS) {
    if (!process.env[name]) {
      console.error(`[env] MISSING REQUIRED ENV VAR: ${name}`);
      process.exit(1);
    }
  }
  for (const name of OPTIONAL_ENV_VARS) {
    if (!process.env[name]) {
      console.warn(`[env] Optional env var ${name} is not set — some features may be unavailable`);
    }
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    validateEnvVars();

    const { initHttpAgent } = await import('./lib/http');
    initHttpAgent();

    const { ensureCredentials } = await import('./lib/auth');
    await ensureCredentials();

    const { startPoller, stopPoller } = await import('./lib/poller');
    const { startScheduler, stopScheduler } = await import('./lib/scheduler');
    const { startConnectorPollers, stopConnectorPollers } = await import('./lib/connector-poller');
    startPoller();
    await startScheduler();
    startConnectorPollers();

    function gracefulShutdown() {
      console.log('[server] shutting down gracefully...');
      stopPoller();
      stopScheduler();
      stopConnectorPollers();
      process.exit(0);
    }

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }
}
