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

export async function fetchPancakeActivePageIds(
  token: string,
  shopId: number,
  pageSize: number = 1000,
  maxPages: number = 3,
): Promise<Set<string>> {
  const allIds = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(
      `${PANCAKE_API}/shops/${shopId}/orders?access_token=${encodeURIComponent(token)}&page_size=${pageSize}&page_number=${page}`,
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (!res.ok) throw new Error(`Pancake orders API HTTP ${res.status}`);
    const data = await res.json() as { data?: Array<{ page_id?: string | number }> };
    let count = 0;
    for (const order of data.data ?? []) {
      if (order.page_id) {
        allIds.add(String(order.page_id));
        count++;
      }
    }
    if (count === 0) break;
  }
  return allIds;
}

export function filterTargetShops(shops: PancakeShop[], targetIds: number[]): PancakeShop[] {
  return shops.filter(s => targetIds.includes(s.id));
}

export const TARGET_SHOP_IDS = [430202960, 1635192689, 1942241731];
