import { NextResponse } from 'next/server';
import { listEndpoints } from '@/lib/db';
import { fetchPancakeShops, TARGET_SHOP_IDS } from '@/lib/pancake';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawShopId = searchParams.get('shop_id');

  const allEndpoints = await listEndpoints();
  const endpoints = allEndpoints.filter(ep => ep.id !== 'botcake-platform' && ep.access_token);
  if (endpoints.length === 0) {
    return NextResponse.json({ ok: false, error: 'No Pancake endpoints configured' }, { status: 400 });
  }

  try {
    const shops = await fetchPancakeShops(endpoints[0].access_token!);
    let targetShops = shops.filter(s => TARGET_SHOP_IDS.includes(s.id));

    if (rawShopId) {
      const id = parseInt(rawShopId, 10);
      targetShops = targetShops.filter(s => s.id === id);
    }

    const result = targetShops.map(s => {
      const ep = endpoints.find(e => parseInt(e.id, 10) === s.id);
      return {
        shop_id: s.id,
        shop_name: s.name,
        shop_label: ep?.shop_label ?? null,
        page_count: s.pages.length,
        pages: s.pages,
      };
    });

    return NextResponse.json({ ok: true, shops: result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
