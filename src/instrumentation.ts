// Next.js instrumentation hook — runs once when the server starts.
// We use it to start the background poller worker.
// Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPoller } = await import('./lib/poller');
    startPoller();
  }
}
