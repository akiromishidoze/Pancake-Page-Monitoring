import { getDb } from '@/lib/db';

const API_BASE = 'https://botcake.io/api/public_api/v1/integration_page/104533988952572';
const FB_GRAPH = 'https://graph.facebook.com/v22.0';

export type BotCakePage = {
  page_id: string;
  name: string;
};

export async function fetchBotCakePages(token: string): Promise<BotCakePage[]> {
  const ids = await fetchBotCakePageIds(token);

  const nameMap = new Map<string, string>();

  // Try Facebook Graph API for names
  const fbToken = process.env.FB_ACCESS_TOKEN;
  if (fbToken) {
    try {
      const res = await fetch(`${FB_GRAPH}/me/accounts?fields=id,name&limit=200`, {
        headers: { Authorization: `Bearer ${fbToken}` },
      });
      const data = await res.json() as { data?: { id: string; name: string }[] };
      if (data.data) {
        for (const p of data.data) {
          nameMap.set(p.id, p.name);
        }
        // Fetch individual names for any remaining pages
        const missing = ids.filter((id) => !nameMap.has(id));
        for (const pageId of missing) {
          try {
            const r = await fetch(`${FB_GRAPH}/${pageId}?fields=id,name`, {
              headers: { Authorization: `Bearer ${fbToken}` },
            });
            const d = await r.json() as { id?: string; name?: string; error?: any };
            if (d.name) nameMap.set(d.id!, d.name);
          } catch {}
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
    const res = await fetch(`${API_BASE}/list_page_id?page=${page}`, {
      headers: { 'user-access-token': token },
    });
    if (!res.ok) break;
    const data: string[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 200) break;
    page++;
  }
  return all;
}
