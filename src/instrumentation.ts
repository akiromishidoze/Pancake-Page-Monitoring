// Next.js instrumentation hook — runs once when the server starts.
// We use it to start the background poller worker and initialize auth.
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
