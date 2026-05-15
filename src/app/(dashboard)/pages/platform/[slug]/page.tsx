import { notFound, redirect } from 'next/navigation';
import { getLatestPageStates, getEndpointBySlug, listPlatformPages, listEndpoints, upsertEndpoint } from '@/lib/db';
import Link from 'next/link';
import { ManagedPagesSection } from '@/components/ManagedPagesSection';
import { PlatformSettings } from '@/components/PlatformSettings';
import { SearchablePageTable } from '@/components/SearchablePageTable';

type Row = {
  page_id: string;
  shop: string | null;
  name: string | null;
  kind: string | null;
  is_activated: boolean;
  is_canary: boolean;
  reason: string | null;
};

async function loadRows(endpointId?: string): Promise<Row[]> {
  const states = getLatestPageStates(endpointId);
  return states.map((s) => ({
    page_id: s.page_id,
    shop: s.shop_label,
    name: s.page_name,
    kind: s.activity_kind,
    is_activated: s.is_activated === 1,
    is_canary: s.is_canary === 1,
    reason: s.activation_reason,
  }));
}

export default async function PlatformPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ shop?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  let platform = getEndpointBySlug(slug);
  if (!platform) {
    if (listEndpoints().length === 0) {
      upsertEndpoint({ name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '), api_key: `auto_${crypto.randomUUID()}`, is_active: 1 });
      redirect(`/pages/platform/${slug}`);
    }
    notFound();
  }

  const [allRows, managedPages] = await Promise.all([
    loadRows(platform.id),
    listPlatformPages(platform.id),
  ]);

  const shops = Array.from(new Set(allRows.map((r) => r.shop).filter((s): s is string => !!s))).sort();
  const hasShops = shops.length > 0;
  const selectedShop = sp.shop || shops[0] || '';
  const shopRows = hasShops ? allRows.filter((r) => r.shop === selectedShop) : allRows;
  const shopCounts = Object.fromEntries(shops.map(s => [s, allRows.filter(r => r.shop === s).length]));
  const allKindsNull = allRows.every(r => !r.kind);
  const activeCount = shopRows.filter((r) => r.is_activated === true).length;
  const inactiveCount = shopRows.filter((r) => r.is_activated === false).length;

  return (
    <div className="space-y-6">
      <Link href="/pages" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        All Platforms
      </Link>

      <div>
        <h2 className="text-2xl font-bold">{platform.name}</h2>
        {hasShops && (
          <p className="text-sm text-slate-400 mt-1">
            {allRows.length} pages across {shops.length} shop{shops.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {hasShops && (
        <>
          <div className="border-b border-slate-800">
            <nav className="flex gap-1 -mb-px">
              {shops.map((shop) => (
                <Link key={shop} href={`/pages/platform/${slug}?shop=${encodeURIComponent(shop)}`}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${shop === selectedShop ? 'border-blue-500 text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'}`}
                >{shop} ({shopCounts[shop]} pages)</Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-300 font-medium">{selectedShop}</span>
            <span className="text-slate-500">{shopRows.length} pages</span>
            <span className="text-green-400">{activeCount} active</span>
            <span className="text-red-400">{inactiveCount} inactive</span>
          </div>
        </>
      )}

      {shopRows.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">No page data for this platform.</div>
      ) : (
        <SearchablePageTable rows={shopRows} hasShops={hasShops} showKinds={!allKindsNull} />
      )}

      <ManagedPagesSection endpointId={platform.id} initialPages={managedPages} />
      <PlatformSettings endpoint={platform} />
    </div>
  );
}
