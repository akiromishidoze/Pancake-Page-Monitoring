import { getSetting, setSetting } from './db';
import { createLogger } from './logger';

const log = createLogger('pancake');

const PANCAKE_API = 'https://pos.pages.fm/api/v1';
const PANCAKE_SHOPS_CACHE_KEY = 'pancake_shops_cache_v2';

export type PancakePage = {
  id: string;
  name: string;
  is_activated: boolean | null;
  shop_id?: number;
  platform?: string;
};

export type PancakeShop = {
  id: number;
  name: string;
  pages: PancakePage[];
};

async function loadCachedShops(): Promise<PancakeShop[] | null> {
  try {
    const raw = await getSetting(PANCAKE_SHOPS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as PancakeShop[];
    return null;
  } catch (e) { log.warn({ err: e }, 'failed to load cached shops'); return null; }
}

async function saveCachedShops(shops: PancakeShop[]): Promise<void> {
  try {
    await setSetting(PANCAKE_SHOPS_CACHE_KEY, JSON.stringify(shops));
  } catch (e) { log.warn({ err: e }, 'failed to save cached shops'); }
}

export async function fetchPancakeShops(token: string): Promise<PancakeShop[]> {
  const res = await fetchWithRetry(`${PANCAKE_API}/shops?access_token=${encodeURIComponent(token)}`, 3, 60_000);
  if (!res.ok) throw new Error(`Pancake shops API HTTP ${res.status}`);
  const raw = await res.json();
  const shops: PancakeShop[] = Array.isArray(raw?.shops) ? raw.shops : [];
  if (shops.length > 0) saveCachedShops(shops);
  return shops;
}

export async function fetchCachedPancakeShops(): Promise<PancakeShop[]> {
  return (await loadCachedShops()) ?? [];
}

export async function fetchPancakePages(token: string): Promise<PancakePage[]> {
  const res = await fetchWithRetry(`${PANCAKE_API}/pages?access_token=${encodeURIComponent(token)}`, 3, 60_000);
  if (!res.ok) throw new Error(`Pancake pages API HTTP ${res.status}`);
  const raw = await res.json();
  const pages: Record<string, unknown>[] = Array.isArray(raw?.pages) ? raw.pages : [];
  return pages.map((p) => ({
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    is_activated: p.is_activated === true,
    shop_id: typeof p.shop_id === 'number' ? p.shop_id : undefined,
    platform: typeof p.platform === 'string' ? p.platform : undefined,
  }));
}

export function mergePagesActivation(
  shops: PancakeShop[],
  pagesApi: PancakePage[],
): PancakeShop[] {
  const activationByPageId = new Map<string, boolean>();
  const platformByPageId = new Map<string, string>();
  for (const p of pagesApi) {
    activationByPageId.set(p.id, p.is_activated === true);
    if (p.platform) platformByPageId.set(p.id, p.platform);
  }

  return shops.map(shop => ({
    ...shop,
    pages: shop.pages.map(p => ({
      ...p,
      is_activated: activationByPageId.has(p.id) ? activationByPageId.get(p.id)! : null,
      platform: platformByPageId.get(p.id) ?? p.platform,
    })),
  }));
}

async function fetchWithRetry(url: string, retries = 2, timeoutMs = 30_000): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.min(1000 * (attempt + 1) + Math.random() * 500, 5000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('unreachable');
}

async function fetchWithRetryLight(url: string): Promise<Response> {
  return fetchWithRetry(url, 1, 20_000);
}

type BatchFetchItem = { page_id?: string | number; timestamp?: string };

async function batchFetchPageIds(
  buildUrl: (page: number) => string,
  extractItems: (data: unknown) => BatchFetchItem[],
  maxBatches: number,
  pageSize: number = 1000,
  cutoffMs: number = Date.now() - 7 * 24 * 60 * 60 * 1000,
): Promise<Set<string>> {
  const allIds = new Set<string>();
  const BATCH = 5;

  for (let batch = 0; batch < maxBatches; batch++) {
    const pageOffset = batch * BATCH;
    const pageNumbers = Array.from({ length: BATCH }, (_, i) => pageOffset + i + 1);

    const results = await Promise.all(pageNumbers.map(async page => {
      try {
        const r = await fetchWithRetryLight(buildUrl(page));
        return r.ok ? r.json() : null;
      } catch { return null; }
    }));

    let hasRecent = false;
    for (const data of results) {
      if (!data) continue;
      for (const item of extractItems(data)) {
        if (!item.timestamp || !item.page_id) continue;
        if (new Date(item.timestamp).getTime() >= cutoffMs) {
          hasRecent = true;
          allIds.add(String(item.page_id));
        }
      }
    }

    let allFull = true;
    for (const data of results) {
      if (data && extractItems(data).length < pageSize) { allFull = false; break; }
    }
    const last = results[results.length - 1];
    if (!last) break;
    if (!allFull) break;
    if (!hasRecent) break;
  }
  return allIds;
}

export async function fetchPancakeActivePageIds(
  token: string,
  shopId: number,
  pageSize: number = 1000,
): Promise<Set<string>> {
  return batchFetchPageIds(
    (page) => `${PANCAKE_API}/shops/${shopId}/orders?access_token=${encodeURIComponent(token)}&page_size=${pageSize}&page_number=${page}`,
    (data) => {
      const d = data as { data?: Array<{ page_id?: string | number; inserted_at?: string }> };
      return d.data?.map(o => ({ page_id: o.page_id, timestamp: o.inserted_at })) ?? [];
    },
    4, pageSize,
  );
}

export async function fetchPancakeActivePageIdsFromCustomers(
  token: string,
  shopId: number,
  pageSize: number = 1000,
): Promise<Set<string>> {
  return batchFetchPageIds(
    (page) => `${PANCAKE_API}/shops/${shopId}/customers?access_token=${encodeURIComponent(token)}&page_size=${pageSize}&page_number=${page}`,
    (data) => {
      const d = data as { data?: Array<{ page_id?: string | number; shop_customer?: { updated_at?: string } }> };
      return d.data?.map(c => ({ page_id: c.page_id, timestamp: c.shop_customer?.updated_at })) ?? [];
    },
    12, pageSize,
  );
}

export const TARGET_SHOP_IDS = [430202960, 1635192689, 1942241731];
