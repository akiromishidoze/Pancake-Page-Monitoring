'use client';

import { useState } from 'react';

type Endpoint = {
  id: string;
  name: string;
  url: string | null;
  api_key: string;
  access_token: string | null;
  token_expires_at: string | null;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
};

function mask(val: string | null | undefined) {
  if (!val) return '';
  if (val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '••••••••' + val.slice(-4);
}

export function SettingsForm({ initialEndpoints }: { initialEndpoints: Endpoint[] }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>(initialEndpoints);
  const [editing, setEditing] = useState<Partial<Endpoint> | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const botcakeEndpoint = endpoints.find(
    (e) => e.id === 'botcake-platform' || e.url?.includes('botcake.io'),
  );
  const shopEndpoints = endpoints.filter(
    (e) => e.id !== 'botcake-platform' && !e.url?.includes('botcake.io'),
  );

  async function save(data: Partial<Endpoint>) {
    setError('');
    setSuccess('');
    const isNew = !data.id;
    try {
      const res = await fetch('/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error || 'Save failed');
        return;
      }
      setSuccess(isNew ? 'Endpoint created' : 'Endpoint updated');
      setEditing(null);
      setEndpoints((prev) => {
        if (isNew) return [...prev, data as Endpoint];
        return prev.map((e) => (e.id === data.id ? { ...e, ...data } as Endpoint : e));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this endpoint?')) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/endpoints/${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!body.ok) { setError(body.error || 'Delete failed'); return; }
      setSuccess('Endpoint deleted');
      setEndpoints((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function renderEndpointRow(ep: Endpoint) {
    return (
      <div key={ep.id} className="px-4 py-3 border-b border-slate-800 last:border-0 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${ep.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium text-slate-200">{ep.name}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 space-y-0.5">
            {ep.url && <div>URL: {ep.url}</div>}
            <div>Key: <span className="font-mono text-slate-400">{mask(ep.api_key)}</span></div>
            {ep.access_token && <div>Token: <span className="font-mono text-slate-400">{mask(ep.access_token)}</span></div>}
            {ep.token_expires_at && <div>Expires: {new Date(ep.token_expires_at).toLocaleString()}</div>}
            {ep.last_used_at && <div>Last used: {new Date(ep.last_used_at).toLocaleString()}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <button
            onClick={() => setEditing(ep)}
            className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            onClick={() => remove(ep.id)}
            className="text-xs px-2 py-1 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  const now = new Date().toISOString().slice(0, 16);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-800 bg-green-900/20 p-3 text-sm text-green-300">{success}</div>
      )}

      {/* BotCake Platform card */}
      {botcakeEndpoint && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
            <h3 className="text-sm font-semibold text-slate-200">BotCake Platform</h3>
          </div>
          {renderEndpointRow(botcakeEndpoint)}
        </div>
      )}

      {/* Pancake Shops card */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
          <h3 className="text-sm font-semibold text-slate-200">Pancake Shops</h3>
          <button
            onClick={() => setEditing({ name: '', api_key: '', url: '', access_token: '', token_expires_at: '' })}
            className="text-xs px-3 py-1.5 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 transition-colors cursor-pointer"
          >
            + Add Shop
          </button>
        </div>

        {shopEndpoints.length === 0 && (
          <div className="p-6 text-sm text-slate-400 text-center">
            No shops configured yet. Add one to receive monitoring data.
          </div>
        )}

        {shopEndpoints.map((ep) => renderEndpointRow(ep))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditing(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-4">
              {editing.id ? 'Edit Endpoint' : 'Add Endpoint'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                  placeholder="My Data Source"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">API Key *</label>
                <input
                  type="text"
                  value={editing.api_key ?? ''}
                  onChange={(e) => setEditing({ ...editing, api_key: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono"
                  placeholder="sk-..."
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Endpoint URL (optional)</label>
                <input
                  type="text"
                  value={editing.url ?? ''}
                  onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Token Expiration (optional)</label>
                <input
                  type="datetime-local"
                  value={editing.token_expires_at ? editing.token_expires_at.slice(0, 16) : ''}
                  onChange={(e) => setEditing({ ...editing, token_expires_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Access Token</label>
                <input
                  type="text"
                  value={editing.access_token ?? ''}
                  onChange={(e) => setEditing({ ...editing, access_token: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono"
                  placeholder="eyJ..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editing.is_active !== 0}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })}
                  className="rounded border-slate-700 bg-slate-800"
                />
                <label htmlFor="is_active" className="text-xs text-slate-400">Active</label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setEditing(null)} className="text-xs px-4 py-2 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => save(editing)}
                disabled={!editing.name || !editing.api_key}
                className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {editing.id ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
