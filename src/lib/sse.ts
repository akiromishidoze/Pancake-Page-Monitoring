import { createLogger } from './logger';

const log = createLogger('sse');

export const MAX_CLIENTS = parseInt(process.env.SSE_MAX_CLIENTS || '500', 10);

const clients = new Map<string, { controller: ReadableStreamDefaultController; scope?: string }>();

let _evictionTimer: ReturnType<typeof setInterval> | null = null;

function startEviction() {
  if (_evictionTimer) return;
  _evictionTimer = setInterval(() => {
    for (const [id, { controller }] of clients) {
      try {
        controller.enqueue(new TextEncoder().encode(': evict-check\n\n'));
      } catch {
        clients.delete(id);
      }
    }
  }, 30_000);
}

export function addClient(id: string, controller: ReadableStreamDefaultController, scope?: string): boolean {
  if (clients.size >= MAX_CLIENTS) {
    log.warn({ max: MAX_CLIENTS }, 'SSE client rejected: max connections reached');
    return false;
  }
  clients.set(id, { controller, scope: scope || undefined });
  startEviction();
  return true;
}

export function removeClient(id: string) {
  clients.delete(id);
}

export function broadcastSSE(event: string, data: string) {
  let eventEndpointId: string | undefined;
  try {
    const parsed = JSON.parse(data);
    eventEndpointId = parsed.endpoint_id;
  } catch (e) {
    log.warn({ err: e }, 'broadcastSSE: invalid JSON data, sending to all');
  }

  const message = `event: ${event}\ndata: ${data}\n\n`;
  for (const [id, { controller, scope }] of clients) {
    if (scope && eventEndpointId && scope !== eventEndpointId) continue;
    // If the stream is full (consumer is slow), skip the message to avoid memory growth
    if (controller.desiredSize !== null && controller.desiredSize <= 0) continue;
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch {
      clients.delete(id);
    }
  }
}

export function stopEviction() {
  if (_evictionTimer) {
    clearInterval(_evictionTimer);
    _evictionTimer = null;
  }
}

export function getClientCount() {
  return clients.size;
}
