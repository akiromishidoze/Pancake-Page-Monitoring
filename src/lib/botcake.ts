import { pool } from '@/lib/db';
import { BotCakePageTokenSchema, BotCakeCustomerDataSchema, BotCakeToolsResponseSchema, BotCakeFlowsResponseSchema, FbPageInfoSchema, PageStateRowSchema } from './schemas';
import { createLogger } from './logger';

const log = createLogger('botcake');

const API_BASE = 'https://botcake.io/api/public_api/v1';
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

async function fetchWithRetry(url: string, token: string, retries = 2, method: 'GET' | 'POST' = 'GET'): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers: { 'user-access-token': token },
        timeout: 20_000,
      });
      if (res.ok) return res;
      if (attempt === retries) return null;
    } catch (e) {
      log.warn({ err: e }, 'botcake fetch attempt %d failed', attempt);
      if (attempt === retries) return null;
    }
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

let _pageTokenCache: { tokens: Map<string, string>; fetchedAt: number } | null = null;

async function getBotCakePageTokens(userToken: string, fbPageId: string): Promise<Map<string, string>> {
  if (_pageTokenCache && Date.now() - _pageTokenCache.fetchedAt < CONVERSATION_CACHE_TTL) {
    return _pageTokenCache.tokens;
  }
  const url = `${API_BASE}/integration_page/list_access_token/${fbPageId}`;
  const res = await fetchWithRetry(url, userToken, 1, 'POST');
  if (!res) return new Map();
  const data = BotCakePageTokenSchema.array().parse(await res.json());
  const tokens = new Map(data.map(d => [d.page_id, d.public_token]));
  _pageTokenCache = { tokens, fetchedAt: Date.now() };
  return tokens;
}

export type ConversationResult = Map<string, { ts: string | null; count: number }>;

type CacheEntry<T> =
  | { hasMatch: true; data: T; checkedAt: number }
  | { hasMatch: false; checkedAt: number };

async function batchCheckWithCache<T>(
  pageIds: string[],
  userToken: string,
  fbPageId: string,
  cache: Map<string, CacheEntry<T>>,
  checkPage: (pageId: string, token: string) => Promise<{ hasMatch: boolean; data: T }>,
  concurrency: number,
  ttl: number = CONVERSATION_CACHE_TTL,
): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  const tokens = await getBotCakePageTokens(userToken, fbPageId);
  if (tokens.size === 0) return result;

  const needsCheck = pageIds.filter(id => {
    const cached = cache.get(id);
    return !cached || Date.now() - cached.checkedAt > ttl;
  });
  for (const id of pageIds) {
    const c = cache.get(id);
    if (c && Date.now() - c.checkedAt <= ttl && c.hasMatch) {
      result.set(id, c.data);
    }
  }

  if (needsCheck.length === 0) return result;

  for (let i = 0; i < needsCheck.length; i += concurrency) {
    const batch = needsCheck.slice(i, i + concurrency);
    await Promise.all(batch.map(async (pageId) => {
      const token = tokens.get(pageId);
      if (!token) {
        cache.set(pageId, { hasMatch: false, checkedAt: Date.now() });
        return;
      }
      try {
        const checkResult = await checkPage(pageId, token);
        if (checkResult.hasMatch) {
          cache.set(pageId, { hasMatch: true, data: checkResult.data, checkedAt: Date.now() });
          result.set(pageId, checkResult.data);
        } else {
          cache.set(pageId, { hasMatch: false, checkedAt: Date.now() });
        }
      } catch (e) {
        log.warn({ err: e }, 'batchCheckWithCache failed for page %s', pageId);
        cache.set(pageId, { hasMatch: false, checkedAt: Date.now() });
      }
    }));
  }

  return result;
}

const _conversationCache = new Map<string, CacheEntry<{ ts: string | null; count: number }>>();

export async function checkBotCakeConversations(pageIds: string[], userToken: string, fbPageId: string): Promise<ConversationResult> {
  return batchCheckWithCache(pageIds, userToken, fbPageId, _conversationCache, async (pageId, token) => {
    const r = await fetchWithTimeout(`${API_BASE}/pages/${pageId}/customer?page=1`, {
      headers: { 'access-token': token },
      timeout: 10_000,
    });
    if (!r.ok) return { hasMatch: false, data: { ts: null, count: 0 } };
    const data = BotCakeCustomerDataSchema.parse(await r.json());
    const customerCount = data.length;
    const hasConversations = customerCount > 0;
    let lastActivityAt: string | null = null;
    if (hasConversations) {
      for (const item of data) {
        const ts = item.created_at ?? item.updated_at ?? null;
        if (typeof ts === 'string' && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
      }
    }
    return { hasMatch: hasConversations, data: { ts: lastActivityAt, count: customerCount } };
  }, 5);
}

const _toolsFlowsCache = new Map<string, CacheEntry<string | null>>();

// ──── Deeper probe: tools + flows for pages without conversations ────

export async function checkBotCakeToolsFlows(pageIds: string[], userToken: string, fbPageId: string): Promise<Map<string, string | null>> {
  return batchCheckWithCache(pageIds, userToken, fbPageId, _toolsFlowsCache, async (pageId, token) => {
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
      const tData = BotCakeToolsResponseSchema.parse(await toolsRes.json());
      if (tData.success && tData.data) {
        for (const tool of tData.data) {
          if (tool.is_published === true) {
            hasToolsOrFlows = true;
            const ts = tool.updated_at ?? null;
            if (typeof ts === 'string' && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
          }
        }
      }
    }
    if (!hasToolsOrFlows && flowsRes.ok) {
      const fData = BotCakeFlowsResponseSchema.parse(await flowsRes.json());
      if (fData.success && fData.data?.flows) {
        for (const flow of fData.data.flows) {
          if (flow.is_removed === false) {
            hasToolsOrFlows = true;
            const ts = flow.updated_at ?? null;
            if (typeof ts === 'string' && (!lastActivityAt || ts > lastActivityAt)) lastActivityAt = ts;
          }
        }
      }
    }

    return { hasMatch: hasToolsOrFlows, data: lastActivityAt };
  }, 3);
}

// ---- FB Graph API name resolution (used for page names only, not status) ----

const _fbPageInfoCache = new Map<string, { status: 'valid' | 'not-found'; name?: string } | 'checking'>();

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
          const d = FbPageInfoSchema.parse(await r.json());
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
      } catch (e) {
        log.warn({ err: e }, 'resolveFbPages failed for page %s', pageId);
        const entry = { status: 'not-found' as const };
        _fbPageInfoCache.set(pageId, entry);
        result.set(pageId, entry);
      }
    }));
  }

  return result;
}

export async function fetchBotCakePages(token: string, fbPageId: string): Promise<BotCakePage[]> {
  const ids = await fetchBotCakePageIds(token, fbPageId);

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

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const known = PageStateRowSchema.array().parse((await pool.query(`SELECT DISTINCT page_id, page_name FROM page_states WHERE page_id IN (${placeholders})`, ids)).rows);
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

export async function fetchBotCakePageIds(token: string, fbPageId: string): Promise<string[]> {
  const all: string[] = [];
  let page = 1;
  while (true) {
    const res = await fetchWithRetry(`${API_BASE}/integration_page/${fbPageId}/list_page_id?page=${page}`, token);
    if (!res) break;
    const data: string[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 200) break;
    page++;
  }
  return all;
}
