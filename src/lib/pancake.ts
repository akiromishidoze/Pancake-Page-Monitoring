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
  if (!res.ok) throw new Error(`Pancake API HTTP ${res.status}`);
  const data = await res.json() as { shops?: PancakeShop[]; success?: boolean };
  return data.shops ?? [];
}

export function filterTargetShops(shops: PancakeShop[], targetIds: number[]): PancakeShop[] {
  return shops.filter(s => targetIds.includes(s.id));
}

export const TARGET_SHOP_IDS = [430202960, 1635192689, 1942241731];
