import { notFound, redirect } from 'next/navigation';
import { getLatestPageStates, getEndpointBySlug, listPlatformPages, listEndpoints, upsertEndpoint } from '@/lib/db';
import Link from 'next/link';
import { ManagedPagesSection } from '@/components/ManagedPagesSection';
import { PlatformSettings } from '@/components/PlatformSettings';

const KIND_TONE: Record<string, string> = {
  funnel_converting: 'bg-green-900/30 text-green-300 border-green-800',
  direct_orders_only: 'bg-emerald-900/30 text-emerald-300 border-emerald-800',
  chat_only: 'bg-yellow-900/30 text-yellow-300 border-yellow-800',
  none: 'bg-slate-800/50 text-slate-400 border-slate-700',
};

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
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr className="text-left text-xs uppercase text-slate-400">
                {!hasShops && <th className="px-4 py-3 font-medium">Shop ID</th>}
                <th className="px-4 py-3 font-medium">Page</th>
                {!allKindsNull && <th className="px-4 py-3 font-medium">Activity</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {shopRows.map((r, i) => (
                <tr key={`${r.page_id || 'noid'}-${r.name || ''}-${i}`} className="hover:bg-slate-800/30">
                  {!hasShops && <td className="px-4 py-3 text-slate-400 text-xs font-mono">{r.page_id}</td>}
                  <td className="px-4 py-3 text-slate-100">
                    <div className="flex items-center gap-2">
                      {r.is_canary && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-900/40 text-amber-300 border border-amber-800">canary</span>}
                      <Link href={`/pages/${r.page_id}`} className="text-slate-100 hover:underline">{r.name ?? '—'}</Link>
                    </div>
                  </td>
                  {!allKindsNull && <td className="px-4 py-3"><span className={`inline-block px-2 py-1 rounded text-xs font-mono border ${KIND_TONE[r.kind ?? 'none'] ?? KIND_TONE.none}`}>{r.kind ?? 'unknown'}</span></td>}
                    <td className="px-4 py-3">
                      {r.is_activated ? (
                        <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-green-900/40 text-green-300 border border-green-800">active</span>
                      ) : (
                        <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-red-900/40 text-red-300 border border-red-800">inactive</span>
                      )}
                    </td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-md truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ManagedPagesSection endpointId={platform.id} initialPages={managedPages} />
      <PlatformSettings endpoint={platform} />
    </div>
  );
}
