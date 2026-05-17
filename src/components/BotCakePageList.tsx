'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';

type BotCakePage = {
  page_id: string;
  page_name: string | null;
  is_activated: number | null;
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

export function BotCakePageList({ pages, overrideIds = [] }: { pages: BotCakePage[]; overrideIds?: string[] }) {
  const [query, setQuery] = useState('');
  const [overriding, setOverriding] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Set<string>>(new Set(overrideIds));

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
    const active = pages.filter(p => p.is_activated === 1).sort((a, b) => (a.page_name ?? a.page_id).localeCompare(b.page_name ?? b.page_id));
    const inactive = pages.filter(p => p.is_activated !== 1).sort((a, b) => (a.page_name ?? a.page_id).localeCompare(b.page_name ?? b.page_id));
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

  return (
    <div className="mt-4">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search pages by name or ID..."
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
      />
      <p className="mt-1 text-xs text-slate-500">Click toggle to manually override a page&apos;s status. Refreshes the poller immediately.</p>
      <div className="mt-2 max-h-72 overflow-auto rounded border border-slate-700">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-800">
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
            {filtered.map(p => {
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
                  <td className={`px-2 py-1 font-mono ${p.is_activated === 1 ? 'text-green-400' : 'text-red-400'}`}>
                    {p.is_activated === 1 ? 'active' : p.activation_reason ?? 'inactive'}
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
                        onClick={() => handleOverride(p.page_id, p.is_activated === 1)}
                        disabled={overriding === p.page_id}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          p.is_activated === 1
                            ? 'bg-red-900/50 text-red-300 hover:bg-red-800/50'
                            : 'bg-green-900/50 text-green-300 hover:bg-green-800/50'
                        } disabled:opacity-50`}
                      >
                        {overriding === p.page_id ? '...' : p.is_activated === 1 ? 'Deactivate' : 'Activate'}
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
    </div>
  );
}
