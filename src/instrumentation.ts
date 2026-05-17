// Next.js instrumentation hook — runs once when the server starts.
// We use it to start the background poller worker and initialize auth.
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureCredentials } = await import('./lib/auth');
    await ensureCredentials();

    const { startPoller } = await import('./lib/poller');
    const { startScheduler } = await import('./lib/scheduler');
    const { startConnectorPollers } = await import('./lib/connector-poller');
    startPoller();
    await startScheduler();
    startConnectorPollers();
  }
}
