import { getDb } from '@/lib/db';

const API_BASE = 'https://botcake.io/api/public_api/v1';
const FB_ID = '104533988952572';
const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const CONVERSATION_CACHE_TTL = 2 * 60 * 1000;

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

async function fetchPostWithRetry(url: string, token: string, retries = 2): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
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

let _pageTokenCache: { tokens: Map<string, string>; fetchedAt: number } | null = null;

async function getBotCakePageTokens(userToken: string): Promise<Map<string, string>> {
  if (_pageTokenCache && Date.now() - _pageTokenCache.fetchedAt < CONVERSATION_CACHE_TTL) {
    return _pageTokenCache.tokens;
  }
  const url = `${API_BASE}/integration_page/list_access_token/${FB_ID}`;
  const res = await fetchPostWithRetry(url, userToken, 1);
  if (!res) return new Map();
  const data = await res.json() as { page_id: string; public_token: string }[];
  if (!Array.isArray(data)) return new Map();
  const tokens = new Map(data.map(d => [d.page_id, d.public_token]));
  _pageTokenCache = { tokens, fetchedAt: Date.now() };
  return tokens;
}

let _conversationCache: Map<string, { hasConversations: boolean; lastActivityAt: string | null; checkedAt: number }> = new Map();

export async function checkBotCakeConversations(pageIds: string[], userToken: string): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const tokens = await getBotCakePageTokens(userToken);
  if (tokens.size === 0) return result;

  const needsCheck = pageIds.filter(id => {
    const cached = _conversationCache.get(id);
    return !cached || Date.now() - cached.checkedAt > CONVERSATION_CACHE_TTL;
  });
  const cached = pageIds.filter(id => {
    const c = _conversationCache.get(id);
    return c && Date.now() - c.checkedAt <= CONVERSATION_CACHE_TTL && c.hasConversations;
  });
  for (const id of cached) {
    const c = _conversationCache.get(id)!;
    result.set(id, c.lastActivityAt);
  }

  if (needsCheck.length === 0) return result;

  const CONCURRENCY = 5;
  for (let i = 0; i < needsCheck.length; i += CONCURRENCY) {
    const batch = needsCheck.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (pageId) => {
      const token = tokens.get(pageId);
      if (!token) {
        _conversationCache.set(pageId, { hasConversations: false, lastActivityAt: null, checkedAt: Date.now() });
        return;
      }
      try {
        const r = await fetchWithTimeout(`${API_BASE}/pages/${pageId}/customer?page=1`, {
          headers: { 'access-token': token },
          timeout: 10_000,
        });
        if (r.ok) {
          const data = await r.json() as Record<string, unknown>[];
          const hasConversations = Array.isArray(data) && data.length > 0;
          let lastActivityAt: string | null = null;
          if (hasConversations) {
            for (const item of data) {
              const ts = (item as Record<string, unknown>).created_at ?? (item as Record<string, unknown>).updated_at ?? null;
              if (typeof ts === 'string' && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
            }
          }
          _conversationCache.set(pageId, { hasConversations, lastActivityAt, checkedAt: Date.now() });
          if (hasConversations) result.set(pageId, lastActivityAt);
        } else {
          _conversationCache.set(pageId, { hasConversations: false, lastActivityAt: null, checkedAt: Date.now() });
        }
      } catch {
        _conversationCache.set(pageId, { hasConversations: false, lastActivityAt: null, checkedAt: Date.now() });
      }
    }));
  }

  return result;
}

// ──── Deeper probe: tools + flows for pages without conversations ────

let _toolsFlowsCache = new Map<string, { hasToolsOrFlows: boolean; lastActivityAt: string | null; checkedAt: number }>();

export async function checkBotCakeToolsFlows(pageIds: string[], userToken: string): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const tokens = await getBotCakePageTokens(userToken);
  if (tokens.size === 0) return result;

  const needsCheck = pageIds.filter(id => {
    const cached = _toolsFlowsCache.get(id);
    return !cached || Date.now() - cached.checkedAt > CONVERSATION_CACHE_TTL;
  });
  const cached = pageIds.filter(id => {
    const c = _toolsFlowsCache.get(id);
    return c && Date.now() - c.checkedAt <= CONVERSATION_CACHE_TTL && c.hasToolsOrFlows;
  });
  for (const id of cached) {
    const c = _toolsFlowsCache.get(id)!;
    result.set(id, c.lastActivityAt);
  }

  if (needsCheck.length === 0) return result;

  const CONCURRENCY = 3;
  for (let i = 0; i < needsCheck.length; i += CONCURRENCY) {
    const batch = needsCheck.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (pageId) => {
      const token = tokens.get(pageId);
      if (!token) {
        _toolsFlowsCache.set(pageId, { hasToolsOrFlows: false, lastActivityAt: null, checkedAt: Date.now() });
        return;
      }
      try {
        const [toolsRes, flowsRes] = await Promise.all([
          fetchWithTimeout(`${API_BASE}/pages/${pageId}/tools`, {
            headers: { 'access-token': token }, timeout: 8_000,
          }),
          fetchWithTimeout(`${API_BASE}/pages/${pageId}/flows`, {
            headers: { 'access-token': token }, timeout: 8_000,
          }),
        ]);
        let hasToolsOrFlows = false;
        let lastActivityAt: string | null = null;

        if (toolsRes.ok) {
          const tData = await toolsRes.json() as { success?: boolean; data?: Record<string, unknown>[] };
          if (tData.success && Array.isArray(tData.data)) {
            for (const tool of tData.data) {
              if (tool.is_published === true) {
                hasToolsOrFlows = true;
                const ts = (tool as Record<string, unknown>).updated_at ?? null;
                if (typeof ts === 'string' && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
              }
            }
          }
        }
        if (!hasToolsOrFlows && flowsRes.ok) {
          const fData = await flowsRes.json() as { success?: boolean; data?: { flows?: Record<string, unknown>[] } };
          if (fData.success && fData.data?.flows) {
            for (const flow of fData.data.flows) {
              if (flow.is_removed === false) {
                hasToolsOrFlows = true;
                const ts = (flow as Record<string, unknown>).updated_at ?? null;
                if (typeof ts === 'string' && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
              }
            }
          }
        }

        _toolsFlowsCache.set(pageId, { hasToolsOrFlows, lastActivityAt, checkedAt: Date.now() });
        if (hasToolsOrFlows) result.set(pageId, lastActivityAt);
      } catch {
        _toolsFlowsCache.set(pageId, { hasToolsOrFlows: false, lastActivityAt: null, checkedAt: Date.now() });
      }
    }));
  }

  return result;
}

export function clearConversationCache() {
  _conversationCache.clear();
  _toolsFlowsCache.clear();
  _pageTokenCache = null;
}

// ---- FB Graph API name resolution (used for page names only, not status) ----

let _fbPageInfoCache = new Map<string, { status: 'valid' | 'not-found'; name?: string } | 'checking'>();

async function resolveFbPages(pageIds: string[]): Promise<Map<string, { status: 'valid' | 'not-found'; name?: string }>> {
  const result = new Map<string, { status: 'valid' | 'not-found'; name?: string }>();
  const fbToken = process.env.FB_ACCESS_TOKEN;
  if (!fbToken) return result;

  const uncached = pageIds.filter(id => !_fbPageInfoCache.has(id) || _fbPageInfoCache.get(id) === 'checking');
  if (uncached.length === 0) {
    for (const id of pageIds) {
      const entry = _fbPageInfoCache.get(id);
      if (entry && entry !== 'checking') result.set(id, entry);
    }
    return result;
  }

  for (const id of uncached) _fbPageInfoCache.set(id, 'checking');

  const CONCURRENCY = 5;
  for (let i = 0; i < uncached.length; i += CONCURRENCY) {
    const batch = uncached.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (pageId) => {
      try {
        const r = await fetchWithTimeout(`${FB_GRAPH}/${pageId}?fields=id,name`, {
          headers: { Authorization: `Bearer ${fbToken}` },
          timeout: 8_000,
        });
        if (r.ok) {
          const d = await r.json() as { id?: string; name?: string; error?: Record<string, unknown> };
          if (d.name) {
            const entry = { status: 'valid' as const, name: d.name };
            _fbPageInfoCache.set(pageId, entry);
            result.set(pageId, entry);
          } else {
            const entry = { status: 'not-found' as const };
            _fbPageInfoCache.set(pageId, entry);
            result.set(pageId, entry);
          }
        } else {
          const entry = { status: 'not-found' as const };
          _fbPageInfoCache.set(pageId, entry);
          result.set(pageId, entry);
        }
      } catch {
        const entry = { status: 'not-found' as const };
        _fbPageInfoCache.set(pageId, entry);
        result.set(pageId, entry);
      }
    }));
  }

  return result;
}

export async function fetchBotCakePages(token: string): Promise<BotCakePage[]> {
  const ids = await fetchBotCakePageIds(token);

  const nameMap = new Map<string, string>();
  const fbToken = process.env.FB_ACCESS_TOKEN;

  if (fbToken) {
    const fbInfo = await resolveFbPages(ids);
    for (const [pageId, info] of fbInfo) {
      if (info.status === 'valid' && info.name) {
        nameMap.set(pageId, info.name);
      }
    }
  }

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
    const res = await fetchWithRetry(`${API_BASE}/integration_page/${FB_ID}/list_page_id?page=${page}`, token);
    if (!res) break;
    const data: string[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 200) break;
    page++;
  }
  return all;
}
