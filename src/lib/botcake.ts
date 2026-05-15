import { getDb } from '@/lib/db';

const API_BASE = 'https://botcake.io/api/public_api/v1/integration_page/104533988952572';
const FB_GRAPH = 'https://graph.facebook.com/v22.0';

export type BotCakePage = {
  page_id: string;
  name: string;
};

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 20_000, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, token: string, retries = 2): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { 'user-access-token': token },
        timeout: 20_000,
      });
      if (res.ok) return res;
      if (attempt === retries) return null;
    } catch {
      if (attempt === retries) return null;
    }
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

export async function fetchBotCakePages(token: string): Promise<BotCakePage[]> {
  const ids = await fetchBotCakePageIds(token);

  const nameMap = new Map<string, string>();

  // Try Facebook Graph API for names
  const fbToken = process.env.FB_ACCESS_TOKEN;
  if (fbToken) {
    try {
      const res = await fetchWithTimeout(`${FB_GRAPH}/me/accounts?fields=id,name&limit=200`, {
        headers: { Authorization: `Bearer ${fbToken}` },
        timeout: 15_000,
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string; name: string }[] };
        if (data.data) {
          for (const p of data.data) {
            nameMap.set(p.id, p.name);
          }
          // Fetch individual names for any remaining pages
          const missing = ids.filter((id) => !nameMap.has(id));
          for (const pageId of missing) {
            try {
              const r = await fetchWithTimeout(`${FB_GRAPH}/${pageId}?fields=id,name`, {
                headers: { Authorization: `Bearer ${fbToken}` },
                timeout: 10_000,
              });
              if (r.ok) {
                const d = await r.json() as { id?: string; name?: string; error?: Record<string, unknown> };
                if (d.name) nameMap.set(d.id!, d.name);
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  // Fallback: cross-reference with DB page_states
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const known = db.prepare(`SELECT DISTINCT page_id, page_name FROM page_states WHERE page_id IN (${placeholders})`).all(...ids) as { page_id: string; page_name: string }[];
  for (const r of known) {
    if (!nameMap.has(r.page_id) && r.page_name) {
      nameMap.set(r.page_id, r.page_name);
    }
  }

  return ids.map((id) => ({
    page_id: id,
    name: nameMap.get(id) ?? `Page ${id}`,
  }));
}

async function fetchBotCakePageIds(token: string): Promise<string[]> {
  const all: string[] = [];
  let page = 1;
  while (true) {
    const res = await fetchWithRetry(`${API_BASE}/list_page_id?page=${page}`, token);
    if (!res) break;
    const data: string[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 200) break;
    page++;
  }
  return all;
}
