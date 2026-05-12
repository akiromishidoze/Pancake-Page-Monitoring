import { fetchReceiverStatus } from '@/lib/receiver';
import { getLatestPageStates, getRunCount } from '@/lib/db';
import Link from 'next/link';

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

export default async function PancakePlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const sp = await searchParams;
  const { rows, source } = await loadRows();

  const shops = Array.from(
    new Set(rows.map((r) => r.shop).filter((s): s is string => !!s)),
  ).sort();

  const selectedShop = sp.shop || shops[0] || '';
  const shopRows = selectedShop
    ? rows.filter((r) => r.shop === selectedShop)
    : [];

  const activeCount = shopRows.filter((r) => r.is_activated).length;
  const inactiveCount = shopRows.length - activeCount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Pancake Platform</h2>
        <p className="text-sm text-slate-400 mt-1">
          {rows.length} pages across {shops.length} shop{shops.length !== 1 ? 's' : ''}
          {source !== 'none' && (
            <span className="ml-2 text-xs text-slate-500">
              (data: {source === 'db' ? 'SQLite' : 'live receiver'})
            </span>
          )}
        </p>
      </div>

      {/* Shop tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-1 -mb-px">
          {shops.map((shop) => {
            const isActive = shop === selectedShop;
            return (
              <Link
                key={shop}
                href={`/pages/pancake?shop=${encodeURIComponent(shop)}`}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-300'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                {shop}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Shop summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-300 font-medium">{selectedShop}</span>
        <span className="text-slate-500">{shopRows.length} pages</span>
        <span className="text-green-400">{activeCount} active</span>
        <span className="text-red-400">{inactiveCount} inactive</span>
      </div>

      {/* Page table */}
      {shopRows.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
          No page data for this shop.
        </div>
      ) : (
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {shopRows.map((r, i) => (
                <tr
                  key={`${r.page_id || 'noid'}-${r.name || ''}-${i}`}
                  className="hover:bg-slate-800/30"
                >
                  <td className="px-4 py-3 text-slate-100">
                    <div className="flex items-center gap-2">
                      {r.is_canary && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-900/40 text-amber-300 border border-amber-800">
                          canary
                        </span>
                      )}
                      <Link href={`/pages/${r.page_id}`} className="text-slate-100 hover:underline">
                        {r.name ?? '—'}
                      </Link>
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
