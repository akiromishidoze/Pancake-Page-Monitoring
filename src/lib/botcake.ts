import { createHash } from 'crypto';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { BotCakePageTokenSchema, BotCakeCustomerDataSchema, BotCakeToolsResponseSchema, BotCakeFlowsResponseSchema, FbPageInfoSchema, PageStateRowSchema } from './schemas';
import { createLogger } from './logger';

const log = createLogger('botcake');

const API_BASE = 'https://botcake.io/api/public_api/v1';
const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const CONVERSATION_CACHE_TTL = 2 * 60 * 1000;
const PAGE_NAME_CACHE_TTL = 24 * 60 * 60 * 1000;
const PAGE_LIST_CACHE_TTL = 5 * 60 * 1000;

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
        headers: { Authorization: `Bearer ${token}`, 'user-access-token': token },
        timeout: 20_000,
      });
      if (res.ok) return res;

      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('Retry-After'));
        if (retryAfter !== null) {
          const jittered = retryAfter + Math.random() * retryAfter;
          log.warn({ url, waitMs: Math.round(jittered) }, 'botcake rate-limited (429), waiting %dms', Math.round(jittered));
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, jittered));
            continue;
          }
        }
      }

      if (attempt === retries) return null;
    } catch (e) {
      log.warn({ err: e }, 'botcake fetch attempt %d failed', attempt);
      if (attempt === retries) return null;
    }
    const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
    await new Promise(r => setTimeout(r, delay * Math.random()));
  }
  return null;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds) && seconds >= 0) return seconds * 1000;
  const parsed = Date.parse(value);
  if (!isNaN(parsed)) return Math.max(0, parsed - Date.now());
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

const INCREMENTAL_BACKOFF_MAX = 16;

type CacheEntry<T> =
  | { hasMatch: true; data: T; checkedAt: number; staleChecks: number }
  | { hasMatch: false; checkedAt: number; staleChecks: number };

function effectiveIncrementalTtl(baseTtl: number, staleChecks: number): number {
  return baseTtl * Math.min(Math.pow(2, staleChecks), INCREMENTAL_BACKOFF_MAX);
}

function dataUnchanged<T>(a: { hasMatch: boolean; data: T }, b: CacheEntry<T>): boolean {
  if (a.hasMatch !== b.hasMatch) return false;
  if (!a.hasMatch) return true;
  return b.hasMatch && JSON.stringify(a.data) === JSON.stringify(b.data);
}

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
    if (!cached) return true;
    return Date.now() - cached.checkedAt > effectiveIncrementalTtl(ttl, cached.staleChecks);
  });
  for (const id of pageIds) {
    const c = cache.get(id);
    if (c && Date.now() - c.checkedAt <= effectiveIncrementalTtl(ttl, c.staleChecks) && c.hasMatch) {
      result.set(id, c.data);
    }
  }

  if (needsCheck.length === 0) return result;

  let idx = 0;
  const workers: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (idx < needsCheck.length) {
      const pageId = needsCheck[idx++];
      const token = tokens.get(pageId);
      if (!token) {
        cache.set(pageId, { hasMatch: false, checkedAt: Date.now(), staleChecks: 0 });
        continue;
      }
      try {
        const checkResult = await checkPage(pageId, token);
        const existing = cache.get(pageId);
        if (existing && dataUnchanged(checkResult, existing)) {
          cache.set(pageId, { ...existing, checkedAt: Date.now(), staleChecks: existing.staleChecks + 1 });
          if (existing.hasMatch) {
            result.set(pageId, existing.data);
          }
        } else if (checkResult.hasMatch) {
          cache.set(pageId, { hasMatch: true, data: checkResult.data, checkedAt: Date.now(), staleChecks: 0 });
          result.set(pageId, checkResult.data);
        } else {
          cache.set(pageId, { hasMatch: false, checkedAt: Date.now(), staleChecks: 0 });
        }
      } catch (e) {
        log.warn({ err: e }, 'batchCheckWithCache failed for page %s', pageId);
        cache.set(pageId, { hasMatch: false, checkedAt: Date.now(), staleChecks: 0 });
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, needsCheck.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

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

const _fbPageInfoCache = new Map<string, Promise<{ status: 'valid' | 'not-found'; name?: string }>>();

async function resolveSingleFbPage(pageId: string, fbToken: string): Promise<{ status: 'valid' | 'not-found'; name?: string }> {
  try {
    const r = await fetchWithTimeout(`${FB_GRAPH}/${pageId}?fields=id,name`, {
      headers: { Authorization: `Bearer ${fbToken}` },
      timeout: 8_000,
    });
    if (r.ok) {
      const d = FbPageInfoSchema.parse(await r.json());
      if (d.name) {
        return { status: 'valid', name: d.name };
      }
    }
  } catch (e) {
    log.warn({ err: e }, 'resolveFbPages failed for page %s', pageId);
  }
  return { status: 'not-found' };
}

async function resolveFbPages(pageIds: string[]): Promise<Map<string, { status: 'valid' | 'not-found'; name?: string }>> {
  const result = new Map<string, { status: 'valid' | 'not-found'; name?: string }>();
  const fbToken = process.env.FB_ACCESS_TOKEN;
  if (!fbToken) return result;

  const promises: Promise<void>[] = [];
  const toFetch: string[] = [];

  for (const pageId of pageIds) {
    const cached = _fbPageInfoCache.get(pageId);
    if (cached) {
      promises.push(cached.then(entry => { result.set(pageId, entry); }));
    } else {
      toFetch.push(pageId);
    }
  }

  if (toFetch.length > 0) {
    const CONCURRENCY = 5;
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      const entries = await Promise.all(batch.map(async (pageId) => {
        const promise = resolveSingleFbPage(pageId, fbToken);
        _fbPageInfoCache.set(pageId, promise);
        const entry = await promise;
        return { pageId, entry };
      }));
      for (const { pageId, entry } of entries) {
        result.set(pageId, entry);
      }
    }
  }

  if (promises.length > 0) await Promise.all(promises);
  return result;
}

const BotCakePageInfoSchema = z.object({
  name: z.string().optional(),
  page_name: z.string().optional(),
  title: z.string().optional(),
}).passthrough();

async function resolveBotCakePageNames(
  unnamedIds: string[],
  token: string,
  fbPageId: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  try {
    const url = `${API_BASE}/integration_page/list_access_token/${fbPageId}`;
    const res = await fetchWithRetry(url, token, 1, 'POST');
    if (res) {
      const data = BotCakePageTokenSchema.array().parse(await res.json());
      for (const entry of data) {
        if (entry.name && unnamedIds.includes(entry.page_id) && !result.has(entry.page_id)) {
          result.set(entry.page_id, entry.name);
        }
      }
    }
  } catch {
    log.warn('botcake: failed to extract page names from list_access_token');
  }

  const stillUnnamed = unnamedIds.filter(id => !result.has(id));
  if (stillUnnamed.length > 0) {
    const PAGE_INFO_CONCURRENCY = 5;
    for (let i = 0; i < stillUnnamed.length; i += PAGE_INFO_CONCURRENCY) {
      const batch = stillUnnamed.slice(i, i + PAGE_INFO_CONCURRENCY);
      await Promise.all(batch.map(async (pageId) => {
        if (result.has(pageId)) return;
        try {
          const pageUrl = `${API_BASE}/pages/${pageId}`;
          const pageRes = await fetch(pageUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (pageRes.ok) {
            const info = BotCakePageInfoSchema.parse(await pageRes.json());
            const pageName = info.name ?? info.page_name ?? info.title;
            if (pageName) {
              result.set(pageId, pageName);
            }
          }
        } catch {
          // best-effort
        }
      }));
    }
  }

  return result;
}

async function getCachedPageNames(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const cutoff = new Date(Date.now() - PAGE_NAME_CACHE_TTL).toISOString();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const rows = await pool.query(
    `SELECT page_id, page_name FROM page_name_cache WHERE page_id IN (${placeholders}) AND updated_at >= $${ids.length + 1}`,
    [...ids, cutoff],
  );
  for (const r of rows.rows) {
    result.set(r.page_id, r.page_name);
  }
  return result;
}

async function setCachedPageNames(entries: Map<string, string>): Promise<void> {
  if (entries.size === 0) return;
  const now = new Date().toISOString();
  for (const [pageId, pageName] of entries) {
    await pool.query(
      `INSERT INTO page_name_cache (page_id, page_name, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (page_id) DO UPDATE SET page_name = EXCLUDED.page_name, updated_at = EXCLUDED.updated_at`,
      [pageId, pageName, now],
    );
  }
}

export async function fetchBotCakePages(token: string, fbPageId: string): Promise<BotCakePage[]> {
  const ids = await fetchBotCakePageIds(token, fbPageId);
  if (ids.length === 0) return [];

  const cached = await getCachedPageNames(ids);
  if (cached.size === ids.length) {
    return ids.map(id => ({ page_id: id, name: cached.get(id) ?? `Page ${id}` }));
  }

  const nameMap = new Map(cached);
  const uncachedIds = ids.filter(id => !nameMap.has(id));

  if (uncachedIds.length > 0) {
    const fbToken = process.env.FB_ACCESS_TOKEN;

    if (fbToken) {
      const fbInfo = await resolveFbPages(uncachedIds);
      for (const [pageId, info] of fbInfo) {
        if (info.status === 'valid' && info.name) {
          nameMap.set(pageId, info.name);
        }
      }
    }

    const placeholders = uncachedIds.map((_, i) => `$${i + 1}`).join(',');
    const known = PageStateRowSchema.array().parse((await pool.query(`SELECT DISTINCT page_id, page_name FROM page_states WHERE page_id IN (${placeholders})`, uncachedIds)).rows);
    for (const r of known) {
      if (!nameMap.has(r.page_id) && r.page_name) {
        nameMap.set(r.page_id, r.page_name);
      }
    }

    const stillUnnamed = uncachedIds.filter(id => !nameMap.has(id));
    if (stillUnnamed.length > 0) {
      const botcakeNames = await resolveBotCakePageNames(stillUnnamed, token, fbPageId);
      for (const [pageId, name] of botcakeNames) {
        nameMap.set(pageId, name);
      }
    }

    const newEntries = new Map<string, string>();
    for (const id of uncachedIds) {
      const name = nameMap.get(id);
      if (name) newEntries.set(id, name);
    }
    void setCachedPageNames(newEntries);
  }

  return ids.map((id) => ({
    page_id: id,
    name: nameMap.get(id) ?? `Page ${id}`,
  }));
}

// ─── BotCake API health probe ──────────────────────────────────────────

export type BotCakeApiHealth = {
  ok: boolean;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
};

const _botCakeApiHealth = new Map<string, BotCakeApiHealth>();

export function getBotCakeApiHealth(): Map<string, BotCakeApiHealth> {
  return _botCakeApiHealth;
}

export function recordBotCakeApiHealth(
  endpointId: string,
  ok: boolean,
  latencyMs: number,
  lastError: string | null,
): void {
  const prev = _botCakeApiHealth.get(endpointId);
  const consecutive = ok ? 0 : (prev ? prev.consecutiveFailures + 1 : 1);
  _botCakeApiHealth.set(endpointId, {
    ok,
    latencyMs,
    lastCheckedAt: new Date().toISOString(),
    lastError,
    consecutiveFailures: consecutive,
  });
}

// ─── Page ID fetcher with hash caching ────────────────────────────────

const _pageListCache = new Map<string, { hash: string; ids: string[]; fetchedAt: number }>();

function pageListHash(ids: string[]): string {
  return createHash('md5').update(JSON.stringify([...ids].sort())).digest('hex');
}

async function fetchPageIdsRaw(token: string, fbPageId: string): Promise<string[]> {
  const all: string[] = [];
  const BATCH = 5;

  for (let batch = 0; ; batch++) {
    const pageOffset = batch * BATCH;
    const pageNumbers = Array.from({ length: BATCH }, (_, i) => pageOffset + i + 1);

    const results = await Promise.all(pageNumbers.map(async pageNum => {
      const res = await fetchWithRetry(`${API_BASE}/integration_page/${fbPageId}/list_page_id?page=${pageNum}`, token);
      if (!res) return null;
      try {
        const raw: unknown = await res.json();
        let data: string[];
        if (Array.isArray(raw)) {
          data = raw;
        } else if (raw && typeof raw === 'object') {
          const obj = raw as Record<string, unknown>;
          data = (obj.data ?? obj.page_ids ?? obj.pages ?? obj.results ?? []) as string[];
          if (!Array.isArray(data)) return null;
        } else {
          return null;
        }
        return data;
      } catch {
        return null;
      }
    }));

    let hasAny = false;
    let anyShort = false;
    for (const data of results) {
      if (!data || data.length === 0) continue;
      hasAny = true;
      all.push(...data);
      if (data.length < 200) anyShort = true;
    }

    if (!hasAny) break;
    if (anyShort) break;
  }
  return all;
}

export async function fetchBotCakePageIds(token: string, fbPageId: string): Promise<string[]> {
  const cacheKey = `page_ids:${fbPageId}`;
  const cached = _pageListCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < PAGE_LIST_CACHE_TTL) {
    return cached.ids;
  }

  const ids = await fetchPageIdsRaw(token, fbPageId);
  const hash = pageListHash(ids);

  if (cached && cached.hash === hash) {
    _pageListCache.set(cacheKey, { ...cached, fetchedAt: Date.now() });
    return cached.ids;
  }

  _pageListCache.set(cacheKey, { hash, ids, fetchedAt: Date.now() });
  return ids;
}
