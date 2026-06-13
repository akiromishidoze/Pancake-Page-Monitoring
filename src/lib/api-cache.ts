const store = new Map<string, { body: string; etag: string; expiresAt: number }>();

export function withCache(handler: (req: Request) => Promise<Response>, ttlMs = 30000) {
  return async (req: Request) => {
    if (req.method !== 'GET') return handler(req);

    const url = new URL(req.url);
    const cacheKey = url.pathname + url.search;
    const cached = store.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      const ifNoneMatch = req.headers.get('if-none-match');
      if (ifNoneMatch === cached.etag) {
        return new Response(null, { status: 304 });
      }
      return new Response(cached.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'ETag': cached.etag,
          'Cache-Control': `private, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=${Math.floor(ttlMs / 1000)}`,
        },
      });
    }

    const response = await handler(req);
    if (response.ok) {
      const body = await response.text();
      const etag = `"${body.length.toString(36)}-${hashCode(body).toString(36)}"`;
      store.set(cacheKey, { body, etag, expiresAt: Date.now() + ttlMs });
      return new Response(body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'ETag': etag,
          'Cache-Control': `private, max-age=${Math.floor(ttlMs / 1000)}, stale-while-revalidate=${Math.floor(ttlMs / 1000)}`,
        },
      });
    }

    return response;
  };
}

export function invalidateCache(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}
