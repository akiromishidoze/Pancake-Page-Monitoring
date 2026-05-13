export const dynamic = 'force-dynamic';

import { addClient, removeClient, getClientCount } from '@/lib/sse';
import { requireApiAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireApiAuth(); if (auth) return auth;
  let id: string | null = null;

  const stream = new ReadableStream({
    start(controller) {
      id = crypto.randomUUID();
      addClient(id, controller);

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
