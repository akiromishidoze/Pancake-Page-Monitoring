// Page List screen — sortable, filterable table of all monitored pages.
// Reads from SQLite (latest snapshot) populated by the background poller.
// Falls back to live receiver fetch if SQLite is empty (cold start).
// Filter state lives in URL search params: ?shop=…&kind=…&status=…&q=…&canary=1

import { fetchReceiverStatus } from '@/lib/receiver';
import { getLatestPageStates, getRunCount } from '@/lib/db';
import Link from 'next/link';
import { PageFilters } from '@/components/PageFilters';

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

  // Cold start: pull live from receiver
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

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { rows, source } = await loadRows();

  // Distinct shops + kinds for filter dropdowns (computed from full row set)
  const shops = Array.from(
    new Set(rows.map((r) => r.shop).filter((s): s is string => !!s)),
  ).sort();
  const kinds = Array.from(
    new Set(rows.map((r) => r.kind).filter((k): k is string => !!k)),
  ).sort((a, b) => (KIND_RANK[b] ?? 0) - (KIND_RANK[a] ?? 0));

  // Apply filters
  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (sp.shop && r.shop !== sp.shop) return false;
    if (sp.kind && r.kind !== sp.kind) return false;
    if (sp.status === 'active' && !r.is_activated) return false;
    if (sp.status === 'inactive' && r.is_activated) return false;
    if (sp.canary === '1' && !r.is_canary) return false;
    if (q && !(r.name ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  // Sort: active by kind strength desc, alphabetical fallback; inactive last
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
        <h2 className="text-2xl font-bold">Pages</h2>
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

      {sorted.length === 0 ? (
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
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
