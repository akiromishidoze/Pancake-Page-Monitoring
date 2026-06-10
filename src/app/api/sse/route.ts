export const dynamic = 'force-dynamic';

import { randomBytes } from 'crypto';
import { addClient, removeClient, getClientCount, MAX_CLIENTS } from '@/lib/sse';
import { requireApiAuth } from '@/lib/auth';
import { ErrorCodes, apiError } from '@/lib/errors';

export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth) return auth;

  if (getClientCount() >= MAX_CLIENTS) {
    return apiError(ErrorCodes.SSE_LIMIT_REACHED, 'Too many connections — server at capacity', 503);
  }

  let id: string | null = null;
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') || undefined;

  const stream = new ReadableStream({
    start(controller) {
      id = randomBytes(16).toString('hex');
      addClient(id, controller, scope);

      controller.enqueue(new TextEncoder().encode(`event: connected\ndata: {"client_count": ${getClientCount()}}\n\n`));

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: keepalive\n\n`));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15000);

      const cleanup = () => {
        clearInterval(keepAlive);
        if (id) removeClient(id);
      };

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (id) removeClient(id);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
