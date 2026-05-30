const clients = new Map<string, ReadableStreamDefaultController>();

let _evictionTimer: ReturnType<typeof setInterval> | null = null;

function startEviction() {
  if (_evictionTimer) return;
  _evictionTimer = setInterval(() => {
    for (const [id, controller] of clients) {
      try {
        controller.enqueue(new TextEncoder().encode(': evict-check\n\n'));
      } catch {
        clients.delete(id);
      }
    }
  }, 30_000);
}

export function addClient(id: string, controller: ReadableStreamDefaultController) {
  clients.set(id, controller);
  startEviction();
}

export function removeClient(id: string) {
  clients.delete(id);
}

export function broadcastSSE(event: string, data: string) {
  const message = `event: ${event}\ndata: ${data}\n\n`;
  for (const [id, controller] of clients) {
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch {
      clients.delete(id);
    }
  }
}

export function getClientCount() {
  return clients.size;
}
