import { createLogger } from './logger';

const log = createLogger('sse');

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

export function addClient(id: string, controller: ReadableStreamDefaultController, scope?: string) {
  clients.set(id, { controller, scope: scope || undefined });
  startEviction();
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
