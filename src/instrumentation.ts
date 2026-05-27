function validateEnvVars() {
  const required = ['DATABASE_URL'] as const;
  const optional = ['FB_ACCESS_TOKEN'] as const;

  for (const name of required) {
    if (!process.env[name]) {
      console.error(`[env] MISSING REQUIRED ENV VAR: ${name}`);
      process.exit(1);
    }
  }

  for (const name of optional) {
    if (!process.env[name]) {
      console.warn(`[env] Optional env var ${name} is not set`);
    }
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  validateEnvVars();

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
        console.error('[instrumentation] ensureCredentials failed:', err);
      }

      pollerMod.startPoller();
      await schedulerMod.startScheduler();
      connectorMod.startConnectorPollers();

      const shutdown = () => {
        console.log('[server] shutting down...');
        pollerMod.stopPoller();
        schedulerMod.stopScheduler();
        connectorMod.stopConnectorPollers();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }).catch(err => {
      console.error('[instrumentation] background workers failed:', err);
    });
  }, 10_000);
}
