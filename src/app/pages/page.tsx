import { fetchReceiverStatus } from '@/lib/receiver';
import { getLatestPageStates, getRunCount } from '@/lib/db';
import Link from 'next/link';
import { PageFilters } from '@/components/PageFilters';
import ShopCompare from '@/components/ShopCompare';

type Row = {
  page_id: string;
  shop: string | null;
  name: string | null;
  kind: string | null;
  is_activated: boolean;
  is_canary: boolean;
  reason: string | null;
  state_change: string | null;
};

const KIND_RANK: Record<string, number> = {
  funnel_converting: 4,
  direct_orders_only: 3,
  chat_only: 2,
  none: 1,
};

const KIND_TONE: Record<string, string> = {
  funnel_converting: 'bg-green-900/30 text-green-300 border-green-800',
  direct_orders_only: 'bg-emerald-900/30 text-emerald-300 border-emerald-800',
  chat_only: 'bg-yellow-900/30 text-yellow-300 border-yellow-800',
  none: 'bg-slate-800/50 text-slate-400 border-slate-700',
};

async function loadRows(): Promise<{ rows: Row[]; source: 'db' | 'live' | 'none' }> {
  const dbCount = getRunCount();
  if (dbCount > 0) {
    const states = getLatestPageStates();
    const rows: Row[] = states.map((s) => ({
      page_id: s.page_id,
      shop: s.shop_label,
      name: s.page_name,
      kind: s.activity_kind,
      is_activated: s.is_activated === 1,
      is_canary: s.is_canary === 1,
      reason: s.activation_reason,
      state_change: s.state_change,
    }));
    return { rows, source: 'db' };
  }

  const live = await fetchReceiverStatus();
  if (!live.ok) return { rows: [], source: 'none' };

  const active = live.data.active_pages ?? [];
  const inactive = live.data.inactive_pages ?? [];
  const rows: Row[] = [
    ...active.map((p) => ({
      page_id: p.page_id ?? p.id ?? '',
      shop: p.shop_label ?? p.shop ?? null,
      name: p.name,
      kind: p.activity_kind ?? p.kind ?? null,
      is_activated: true,
      is_canary: p.is_canary ?? false,
      reason: p.activation_reason ?? p.reason ?? null,
      state_change: p.state_change ?? null,
    })),
    ...inactive.map((p) => ({
      page_id: p.page_id ?? p.id ?? '',
      shop: p.shop_label ?? p.shop ?? null,
      name: p.name,
      kind: p.activity_kind ?? p.kind ?? null,
      is_activated: false,
      is_canary: p.is_canary ?? false,
      reason: p.activation_reason ?? p.reason ?? null,
      state_change: p.state_change ?? null,
    })),
  ];
  return { rows, source: 'live' };
}

type SearchParams = {
  shop?: string;
  kind?: string;
  status?: 'active' | 'inactive' | string;
  q?: string;
  canary?: string;
};

function computePlatformSummary(rows: Row[]) {
  const map = new Map<string, { total: number; active: number; inactive: number; kinds: Map<string, number> }>();
  for (const r of rows) {
    const shop = r.shop ?? 'Uncategorized';
    if (!map.has(shop)) map.set(shop, { total: 0, active: 0, inactive: 0, kinds: new Map() });
    const entry = map.get(shop)!;
    entry.total++;
    if (r.is_activated) entry.active++;
    else entry.inactive++;
    const kind = r.kind ?? 'none';
    entry.kinds.set(kind, (entry.kinds.get(kind) ?? 0) + 1);
  }
  return map;
}

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { rows, source } = await loadRows();
  const selectedShop = sp.shop;

  // ─── Platform List View ──────────────────────────────────────────────
  if (!selectedShop) {
    const platforms = computePlatformSummary(rows);
    const platformNames = Array.from(platforms.keys()).sort();
    const totalAll = rows.length;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Platforms</h2>
          <p className="text-sm text-slate-400 mt-1">
            {totalAll} pages across {platformNames.length} platform{platformNames.length !== 1 ? 's' : ''}
            {source !== 'none' && (
              <span className="ml-2 text-xs text-slate-500">
                (data: {source === 'db' ? 'SQLite' : 'live receiver'})
              </span>
            )}
          </p>
        </div>

        {platformNames.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
            No page data yet. The poller will populate this table after the next run completes.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {platformNames.map((shop) => {
              const s = platforms.get(shop)!;
              const topKinds = Array.from(s.kinds.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
              return (
                <Link
                  key={shop}
                  href={`/pages?shop=${encodeURIComponent(shop)}`}
                  className="rounded-lg border border-slate-800 bg-slate-900 p-5 hover:border-slate-600 hover:bg-slate-800/50 transition-all block"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-slate-100">{shop}</h3>
                    <span className="text-xs text-slate-500">{s.total} pages</span>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span className="text-green-400 font-medium">{s.active} active</span>
                    <span className="text-red-400 font-medium">{s.inactive} inactive</span>
                  </div>
                  {topKinds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {topKinds.map(([kind, count]) => (
                        <span
                          key={kind}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${KIND_TONE[kind] ?? KIND_TONE.none}`}
                        >
                          {kind}
                          <span className="opacity-60">{count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── Shop-specific Table View ────────────────────────────────────────
  const shops = Array.from(
    new Set(rows.map((r) => r.shop).filter((s): s is string => !!s)),
  ).sort();

  const rowsForCompare = rows.map((s) => ({
    page_id: s.page_id,
    shop: s.shop ?? null,
    name: s.name ?? null,
    kind: s.kind ?? null,
    is_activated: !!s.is_activated,
    is_canary: !!s.is_canary,
    reason: s.reason ?? null,
    state_change: s.state_change ?? null,
  }));
  const kinds = Array.from(
    new Set(rows.map((r) => r.kind).filter((k): k is string => !!k)),
  ).sort((a, b) => (KIND_RANK[b] ?? 0) - (KIND_RANK[a] ?? 0));

  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (selectedShop && r.shop !== selectedShop) return false;
    if (sp.kind && r.kind !== sp.kind) return false;
    if (sp.status === 'active' && !r.is_activated) return false;
    if (sp.status === 'inactive' && r.is_activated) return false;
    if (sp.canary === '1' && !r.is_canary) return false;
    if (q && !(r.name ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.is_activated !== b.is_activated) return a.is_activated ? -1 : 1;
    const aRank = KIND_RANK[a.kind ?? ''] ?? 0;
    const bRank = KIND_RANK[b.kind ?? ''] ?? 0;
    if (aRank !== bRank) return bRank - aRank;
    return (
      (a.shop ?? '').localeCompare(b.shop ?? '') ||
      (a.name ?? '').localeCompare(b.name ?? '')
    );
  });

  const totalActive = sorted.filter((r) => r.is_activated).length;
  const totalInactive = sorted.length - totalActive;
  const totalAll = rows.length;
  const showingAll = filtered.length === totalAll;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/pages"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          All Platforms
        </Link>
        <h2 className="text-2xl font-bold">{selectedShop}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {showingAll
            ? `${totalAll} pages monitored`
            : `${sorted.length} of ${totalAll} pages match`}
          {' — '}
          {totalActive} active, {totalInactive} inactive
          {source !== 'none' && (
            <span className="ml-2 text-xs text-slate-500">
              (data: {source === 'db' ? 'SQLite' : 'live receiver'})
            </span>
          )}
        </p>
      </div>

      <PageFilters shops={shops} kinds={kinds} />

      <div className="mt-4">
        <ShopCompare rows={rowsForCompare} shops={shops} />
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
          {totalAll === 0
            ? 'No page data yet. The poller will populate this table after the next n8n run completes.'
            : 'No pages match the current filters.'}
        </div>
      ) : (
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3 font-medium">Shop</th>
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sorted.map((r, i) => (
                <tr
                  key={`${r.page_id || 'noid'}-${r.shop || ''}-${r.name || ''}-${i}`}
                  className="hover:bg-slate-800/30"
                >
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                    {r.shop ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-100">
                    <div className="flex items-center gap-2">
                      {r.is_canary && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-900/40 text-amber-300 border border-amber-800">
                          canary
                        </span>
                      )}
                      <Link href={`/pages/${r.page_id}`} className="text-slate-100 hover:underline">{r.name ?? '—'}</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-mono border ${
                        KIND_TONE[r.kind ?? 'none'] ?? KIND_TONE.none
                      }`}
                    >
                      {r.kind ?? 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                        r.is_activated
                          ? 'bg-green-900/40 text-green-300 border border-green-800'
                          : 'bg-red-900/30 text-red-400 border border-red-900'
                      }`}
                    >
                      {r.is_activated ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-slate-400 text-xs max-w-md truncate"
                    title={r.reason ?? ''}
                  >
                    {r.reason ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
