'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type PageRow = {
  page_id: string;
  shop: string | null;
  name: string | null;
  kind: string | null;
  is_activated: boolean;
  is_canary: boolean;
  reason: string | null;
};

const KIND_TONE: Record<string, string> = {
  funnel_converting: 'bg-green-900/30 text-green-300 border-green-800',
  direct_orders_only: 'bg-emerald-900/30 text-emerald-300 border-emerald-800',
  chat_only: 'bg-yellow-900/30 text-yellow-300 border-yellow-800',
  none: 'bg-slate-800/50 text-slate-400 border-slate-700',
};

export function SearchablePageTable({ rows, hasShops, showKinds }: { rows: PageRow[]; hasShops: boolean; showKinds: boolean }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(r =>
      r.name?.toLowerCase().includes(q) ||
      r.page_id.toLowerCase().includes(q) ||
      r.shop?.toLowerCase().includes(q) ||
      r.kind?.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-800">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search pages..."
          className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-800/50">
          <tr className="text-left text-xs uppercase text-slate-400">
            {!hasShops && <th className="px-4 py-3 font-medium">Shop ID</th>}
            <th className="px-4 py-3 font-medium">Page</th>
            {showKinds && <th className="px-4 py-3 font-medium">Activity</th>}
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {filtered.map((r, i) => (
            <tr key={`${r.page_id || 'noid'}-${r.name || ''}-${i}`} className="hover:bg-slate-800/30">
              {!hasShops && <td className="px-4 py-3 text-slate-400 text-xs font-mono">{r.page_id}</td>}
              <td className="px-4 py-3 text-slate-100">
                <div className="flex items-center gap-2">
                  {r.is_canary && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-900/40 text-amber-300 border border-amber-800">canary</span>}
                  <Link href={`/pages/${r.page_id}`} className="text-slate-100 hover:underline">{r.name ?? '—'}</Link>
                </div>
              </td>
              {showKinds && <td className="px-4 py-3"><span className={`inline-block px-2 py-1 rounded text-xs font-mono border ${KIND_TONE[r.kind ?? 'none'] ?? KIND_TONE.none}`}>{r.kind ?? 'unknown'}</span></td>}
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
      {filtered.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-slate-500">No pages match &quot;{query}&quot;</div>
      )}
    </div>
  );
}
