'use client';

import { useState, useEffect } from 'react';

type Connector = {
  id: string;
  name: string;
  platform_type: string;
  api_url: string;
  auth_header: string | null;
  auth_token: string | null;
  json_path: string | null;
  interval_ms: number;
  is_active: number;
};

function mask(val: string | null | undefined) {
  if (!val) return '';
  if (val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '••••••••' + val.slice(-4);
}

export function ConnectorsSettings() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [editing, setEditing] = useState<Partial<Connector> | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/connectors').then(r => r.json()).then(d => {
      if (d.ok) setConnectors(d.connectors);
    }).catch(() => {});
  }, []);

  async function save(data: Partial<Connector>) {
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!body.ok) { setError(body.error || 'Save failed'); return; }
      setSuccess('Connector saved');
      setEditing(null);
      setConnectors((prev) => {
        if (data.id) return prev.map((c) => c.id === data.id ? { ...c, ...data } as Connector : c);
        return [...prev, body.connector];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this connector?')) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/connectors/${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!body.ok) { setError(body.error || 'Delete failed'); return; }
      setSuccess('Connector deleted');
      setConnectors((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Platform Connectors</h3>
          <p className="text-xs text-slate-400 mt-1">
            Configure generic platform polling connectors for any API.
          </p>
        </div>
        <button
          onClick={() => setEditing({ name: '', platform_type: 'rest', api_url: '', interval_ms: 60000, is_active: 1 })}
          className="text-xs px-3 py-1.5 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 transition-colors cursor-pointer"
        >
          + Add Connector
        </button>
      </div>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>}
      {success && <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>}

      {connectors.length === 0 && !editing && (
        <div className="text-sm text-slate-400 text-center py-4">
          No platform connectors configured yet.
        </div>
      )}

      <div className="space-y-2">
        {connectors.map((c) => (
          <div key={c.id} className="px-4 py-3 border border-slate-800 rounded-lg flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${c.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-slate-200">{c.name}</span>
                <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{c.platform_type}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500 space-y-0.5">
                <div>URL: <span className="text-slate-400">{c.api_url}</span></div>
                {c.auth_header && <div>Auth: <span className="text-slate-400">{c.auth_header}: {mask(c.auth_token)}</span></div>}
                {c.json_path && <div>JSON path: <span className="text-slate-400">{c.json_path}</span></div>}
                <div>Interval: <span className="text-slate-400">{c.interval_ms / 1000}s</span></div>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <button onClick={() => setEditing(c)}
                className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >Edit</button>
              <button onClick={() => remove(c.id)}
                className="text-xs px-2 py-1 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
              >Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditing(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-4">
              {editing.id ? 'Edit Connector' : 'Add Connector'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name *</label>
                <input type="text" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" placeholder="My Platform" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Platform Type *</label>
                <select value={editing.platform_type ?? 'rest'} onChange={(e) => setEditing({ ...editing, platform_type: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                  <option value="rest">REST API</option>
                  <option value="graphql">GraphQL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">API URL *</label>
                <input type="text" value={editing.api_url ?? ''} onChange={(e) => setEditing({ ...editing, api_url: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono" placeholder="https://api.example.com/pages" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Auth Header (optional)</label>
                <input type="text" value={editing.auth_header ?? ''} onChange={(e) => setEditing({ ...editing, auth_header: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono" placeholder="Authorization" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Auth Token (optional)</label>
                <input type="text" value={editing.auth_token ?? ''} onChange={(e) => setEditing({ ...editing, auth_token: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono" placeholder="Bearer ..." />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">JSON Path (optional, e.g. data.pages)</label>
                <input type="text" value={editing.json_path ?? ''} onChange={(e) => setEditing({ ...editing, json_path: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono" placeholder="data.items" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Poll Interval (seconds)</label>
                <input type="number" value={(editing.interval_ms ?? 60000) / 1000} onChange={(e) => setEditing({ ...editing, interval_ms: parseInt(e.target.value, 10) * 1000 })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" min="10" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="c_is_active" checked={editing.is_active !== 0}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })}
                  className="rounded border-slate-700 bg-slate-800" />
                <label htmlFor="c_is_active" className="text-xs text-slate-400">Active</label>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setEditing(null)}
                className="text-xs px-4 py-2 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button onClick={() => save(editing)} disabled={!editing.name || !editing.api_url}
                className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer">
                {editing.id ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
