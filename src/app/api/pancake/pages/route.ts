import { NextResponse } from 'next/server';
import { ErrorCodes, apiError, apiCatch } from '@/lib/errors';
import { listEndpoints, isPancakeEndpoint } from '@/lib/db';
import { fetchPancakeShops, TARGET_SHOP_IDS } from '@/lib/pancake';
import { cors, corsOptions } from '@/lib/cors';

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawShopId = searchParams.get('shop_id');

  const allEndpoints = await listEndpoints();
  const endpoints = allEndpoints.filter(ep => isPancakeEndpoint(ep) && ep.access_token);
  if (endpoints.length === 0) {
    return cors(apiError(ErrorCodes.NOT_FOUND, 'No Pancake endpoints configured', 400));
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

    return cors(NextResponse.json({ ok: true, shops: result }));
  } catch (e) {
    return cors(apiCatch(e));
  }
}
