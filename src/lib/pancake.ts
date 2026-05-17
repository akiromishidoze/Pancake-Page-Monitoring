import { getSetting, setSetting } from './db';

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
  } catch { return null; }
}

async function saveCachedShops(shops: PancakeShop[]): Promise<void> {
  try {
    await setSetting(PANCAKE_SHOPS_CACHE_KEY, JSON.stringify(shops));
  } catch { /* best effort */ }
}

export async function fetchPancakeShops(token: string): Promise<PancakeShop[]> {
  const res = await fetchWithRetry(`${PANCAKE_API}/shops?access_token=${encodeURIComponent(token)}`, 3, 60_000);
  if (!res.ok) throw new Error(`Pancake shops API HTTP ${res.status}`);
  const data = await res.json() as { shops?: PancakeShop[]; success?: boolean };
  const shops = data.shops ?? [];
  if (shops.length > 0) saveCachedShops(shops);
  return shops;
}

export async function fetchCachedPancakeShops(): Promise<PancakeShop[]> {
  return (await loadCachedShops()) ?? [];
}

export async function fetchPancakePages(token: string): Promise<PancakePage[]> {
  const res = await fetchWithRetry(`${PANCAKE_API}/pages?access_token=${encodeURIComponent(token)}`, 3, 60_000);
  if (!res.ok) throw new Error(`Pancake pages API HTTP ${res.status}`);
  const data = await res.json() as { pages?: PancakePage[]; categorized?: Record<string, unknown>; success?: boolean };
  const pages = data.pages ?? [];
  return pages.map((p: Record<string, unknown>) => ({
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    is_activated: p.is_activated === true,
    shop_id: p.shop_id as number | undefined,
    platform: p.platform as string | undefined,
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

export async function fetchPancakeActivePageIds(
  token: string,
  shopId: number,
  pageSize: number = 1000,
): Promise<Set<string>> {
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allIds = new Set<string>();
  const BATCH = 5;
  const MAX_BATCHES = 4;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const pageOffset = batch * BATCH;
    const pageNumbers = Array.from({ length: BATCH }, (_, i) => pageOffset + i + 1);

    const results = await Promise.all(pageNumbers.map(page =>
      fetchWithRetryLight(
        `${PANCAKE_API}/shops/${shopId}/orders?access_token=${encodeURIComponent(token)}&page_size=${pageSize}&page_number=${page}`,
      ).then(r => {
        if (!r.ok) return null;
        return r.json() as Promise<{ data?: Array<{ page_id?: string | number; inserted_at?: string }> } | null>;
      }).catch(() => null)
    ));

    for (const data of results) {
      if (!data?.data) continue;
      for (const order of data.data) {
        if (!order.inserted_at || !order.page_id) continue;
        if (new Date(order.inserted_at).getTime() >= cutoffMs) {
          allIds.add(String(order.page_id));
        }
      }
    }

    const last = results[results.length - 1];
    if (!last?.data?.length) break;
    if (last.data.length < pageSize) break;
    const newestOnLast = last.data[0]?.inserted_at;
    if (newestOnLast && new Date(newestOnLast).getTime() < cutoffMs) break;
  }
  return allIds;
}

export async function fetchPancakeActivePageIdsFromCustomers(
  token: string,
  shopId: number,
  pageSize: number = 1000,
): Promise<Set<string>> {
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allIds = new Set<string>();
  const BATCH = 5;
  const MAX_BATCHES = 12;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const pageOffset = batch * BATCH;
    const pageNumbers = Array.from({ length: BATCH }, (_, i) => pageOffset + i + 1);

    const results = await Promise.all(pageNumbers.map(page =>
      fetchWithRetryLight(
        `${PANCAKE_API}/shops/${shopId}/customers?access_token=${encodeURIComponent(token)}&page_size=${pageSize}&page_number=${page}`,
      ).then(r => r.json()).catch(() => null as { data?: Array<{ page_id?: string | number; shop_customer?: { updated_at?: string } }> } | null)
    ));

    let allOld = true;
    for (const data of results) {
      if (!data?.data) continue;
      for (const c of data.data) {
        const updatedAt = c.shop_customer?.updated_at;
        if (!updatedAt || !c.page_id) continue;
        if (new Date(updatedAt).getTime() >= cutoffMs) {
          allOld = false;
          allIds.add(String(c.page_id));
        }
      }
    }

    const last = results[results.length - 1];
    if (!last?.data?.length) break;
    if (last.data.length < pageSize) break;
    if (allOld) break;
  }
  return allIds;
}

export function filterTargetShops(shops: PancakeShop[], targetIds: number[]): PancakeShop[] {
  return shops.filter(s => targetIds.includes(s.id));
}

export const TARGET_SHOP_IDS = [430202960, 1635192689, 1942241731];
