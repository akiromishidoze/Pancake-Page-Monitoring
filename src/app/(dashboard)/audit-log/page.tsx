'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatWithTz } from '@/lib/format';

type AuditEntry = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string;
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (actionFilter) params.set('action', actionFilter);
    if (entityTypeFilter) params.set('entity_type', entityTypeFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    setLoading(true);
    try {
      const r = await fetch(`/api/audit-log?${params}`);
      const body = await r.json();
      if (body.ok) {
        setEntries(body.entries);
        setTotal(body.total);
        if (body.actions) setActions(body.actions);
        if (body.entity_types) setEntityTypes(body.entity_types);
      } else {
        setError(body.error || 'Failed to load audit log');
      }
    } catch {
      setError('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [offset, actionFilter, entityTypeFilter, dateFrom, dateTo, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const resetFilters = () => {
    setActionFilter('');
    setEntityTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setOffset(0);
  };

  const hasFilters = actionFilter || entityTypeFilter || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Audit Log</h2>
        <p className="text-sm text-slate-400 mt-1">
          Track changes made to the system configuration.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setOffset(0); }}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">All actions</option>
          {actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={entityTypeFilter}
          onChange={e => { setEntityTypeFilter(e.target.value); setOffset(0); }}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">All entities</option>
          {entityTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setOffset(0); }}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setOffset(0); }}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          title="To date"
        />

        <span className="text-xs text-slate-500">{total} total entries</span>

        {hasFilters && (
          <button
            onClick={resetFilters}
            className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-400 text-center">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 text-center">No audit entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Time</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Action</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Entity</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Detail</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/20">
                    <td className="px-4 py-2 text-xs font-mono text-slate-400 whitespace-nowrap">
                      {formatWithTz(entry.created_at)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {entry.entity_type && (
                        <span className="text-xs">
                          {entry.entity_type}{entry.entity_id ? ` / ${entry.entity_id}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-xs max-w-xs truncate">
                      {entry.detail || '—'}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-slate-500">
                      {entry.ip_address || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > limit && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setOffset(prev => Math.max(0, prev - limit))}
            disabled={offset === 0}
            className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(prev => prev + limit)}
            disabled={offset + limit >= total}
            className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
