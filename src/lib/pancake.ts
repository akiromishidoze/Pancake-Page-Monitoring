const PANCAKE_API = 'https://pos.pages.fm/api/v1';

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

export async function fetchPancakeShops(token: string): Promise<PancakeShop[]> {
  const res = await fetch(`${PANCAKE_API}/shops?access_token=${encodeURIComponent(token)}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Pancake shops API HTTP ${res.status}`);
  const data = await res.json() as { shops?: PancakeShop[]; success?: boolean };
  return data.shops ?? [];
}

export async function fetchPancakePages(token: string): Promise<PancakePage[]> {
  const res = await fetch(`${PANCAKE_API}/pages?access_token=${encodeURIComponent(token)}`, {
    headers: { 'Content-Type': 'application/json' },
  });
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

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

export async function fetchPancakeActivePageIds(
  token: string,
  shopId: number,
  pageSize: number = 1000,
): Promise<Set<string>> {
  const cutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const allIds = new Set<string>();
  const BATCH = 5;
  const MAX_BATCHES = 4;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const pageOffset = batch * BATCH;
    const pageNumbers = Array.from({ length: BATCH }, (_, i) => pageOffset + i + 1);

    const results = await Promise.all(pageNumbers.map(page =>
      fetchWithRetry(
        `${PANCAKE_API}/shops/${shopId}/orders?access_token=${encodeURIComponent(token)}&page_size=${pageSize}&page_number=${page}`,
      ).then(r => r.json()).catch(() => null as { data?: Array<{ page_id?: string | number; inserted_at?: string }> } | null)
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

export function filterTargetShops(shops: PancakeShop[], targetIds: number[]): PancakeShop[] {
  return shops.filter(s => targetIds.includes(s.id));
}

export const TARGET_SHOP_IDS = [430202960, 1635192689, 1942241731];
