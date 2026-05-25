'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';

type BotCakePage = {
  page_id: string;
  page_name: string | null;
  is_activated: boolean | null;
  activation_reason: string | null;
  hours_since_last_customer_activity: number | null;
  customer_count: number | null;
};

function formatRelativeTime(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins}m ago`;
  }
  if (hours < 24) {
    return `${Math.round(hours)}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const PAGE_SIZE = 20;

export function BotCakePageList({ pages, overrideIds = [] }: { pages: BotCakePage[]; overrideIds?: string[] }) {
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Set<string>>(new Set(overrideIds));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(rawQuery);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawQuery]);

  const handleOverride = useCallback(async (pageId: string, isActive: boolean) => {
    setOverriding(pageId);
    try {
      const res = await fetch('/api/botcake-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: pageId, is_active: !isActive, reason: 'manual-override' }),
      });
      if (res.ok) {
        setOverrides(prev => new Set(prev).add(pageId));
      }
    } finally {
      setOverriding(null);
    }
  }, []);

  const handleClear = useCallback(async (pageId: string) => {
    setOverriding(pageId);
    try {
      const res = await fetch('/api/botcake-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: pageId, remove: true }),
      });
      if (res.ok) {
        setOverrides(prev => { const next = new Set(prev); next.delete(pageId); return next; });
      }
    } finally {
      setOverriding(null);
    }
  }, []);

  const sorted = useMemo(() => {
    const active = pages.filter(p => p.is_activated).sort((a, b) => (a.page_name ?? a.page_id).localeCompare(b.page_name ?? b.page_id));
    const inactive = pages.filter(p => !p.is_activated).sort((a, b) => (a.page_name ?? a.page_id).localeCompare(b.page_name ?? b.page_id));
    return [...active, ...inactive];
  }, [pages]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter(p =>
      p.page_name?.toLowerCase().includes(q) ||
      p.page_id.toLowerCase().includes(q)
    );
  }, [sorted, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={rawQuery}
          onChange={e => { setRawQuery(e.target.value); setPage(0); }}
          placeholder="Search pages by name or ID..."
          className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">{filtered.length} page{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Click toggle to manually override a page&apos;s status. Refreshes the poller immediately.</p>
      <div className="mt-2 rounded border border-slate-700">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-800">
            <tr className="text-left text-slate-400 uppercase">
              <th className="px-2 py-1">Page</th>
              <th className="px-2 py-1">ID</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Override</th>
              <th className="px-2 py-1">Customers</th>
              <th className="px-2 py-1">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {paged.map(p => {
              const hours = p.hours_since_last_customer_activity;
              const lastActivity = hours !== null && hours !== undefined
                ? formatRelativeTime(hours)
                : '—';
              return (
                <tr key={p.page_id} className="hover:bg-slate-800/30">
                  <td className="px-2 py-1 text-slate-100">
                    <Link href={`/pages/${p.page_id}`} className="hover:underline">{p.page_name ?? p.page_id}</Link>
                  </td>
                  <td className="px-2 py-1 text-slate-500 font-mono">{p.page_id}</td>
                  <td className={`px-2 py-1 font-mono ${p.is_activated ? 'text-green-400' : 'text-red-400'}`}>
                    {p.is_activated ? 'active' : p.activation_reason ?? 'inactive'}
                    {overrides.has(p.page_id) && <span className="ml-1 text-yellow-400">*</span>}
                  </td>
                  <td className="px-2 py-1">
                    {overrides.has(p.page_id) ? (
                      <button
                        onClick={() => handleClear(p.page_id)}
                        disabled={overriding === p.page_id}
                        className="rounded px-2 py-0.5 text-xs font-medium transition-colors bg-yellow-900/50 text-yellow-300 hover:bg-yellow-800/50 disabled:opacity-50"
                      >
                        {overriding === p.page_id ? '...' : 'Clear'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOverride(p.page_id, p.is_activated ?? false)}
                        disabled={overriding === p.page_id}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          p.is_activated
                            ? 'bg-red-900/50 text-red-300 hover:bg-red-800/50'
                            : 'bg-green-900/50 text-green-300 hover:bg-green-800/50'
                        } disabled:opacity-50`}
                      >
                        {overriding === p.page_id ? '...' : p.is_activated ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1 text-slate-400 font-mono">{p.customer_count ?? '—'}</td>
                  <td className="px-2 py-1 text-slate-400 font-mono">{lastActivity}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-slate-500">No pages match &quot;{query}&quot;</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="rounded px-2 py-1 text-xs font-medium transition-colors bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-500">
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="rounded px-2 py-1 text-xs font-medium transition-colors bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
