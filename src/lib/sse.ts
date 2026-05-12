type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

const clients = new Map<string, SSEClient>();

export function addClient(id: string, controller: ReadableStreamDefaultController) {
  clients.set(id, { id, controller });
}

export function removeClient(id: string) {
  clients.delete(id);
}

export function broadcastSSE(event: string, data: string) {
  const message = `event: ${event}\ndata: ${data}\n\n`;
  for (const [id, client] of clients) {
    try {
      client.controller.enqueue(new TextEncoder().encode(message));
    } catch {
      clients.delete(id);
    }
  }
}

export function getClientCount() {
  return clients.size;
}
