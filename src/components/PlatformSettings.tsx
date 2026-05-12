'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Endpoint = {
  id: string;
  name: string;
  url: string | null;
  api_key: string;
  access_token: string | null;
  token_expires_at: string | null;
  is_active: number;
};

function mask(val: string | null | undefined) {
  if (!val) return '';
  if (val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '••••••••' + val.slice(-4);
}

export function PlatformSettings({ endpoint: initial }: { endpoint: Endpoint }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    id: initial.id,
    name: initial.name,
    url: initial.url || '',
    api_key: initial.api_key,
    access_token: initial.access_token || '',
    is_active: initial.is_active,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function save() {
    setError('');
    setSuccess('');
    if (!form.name) { setError('Shop name is required'); return; }
    if (!form.api_key) { setError('API Key is required'); return; }

    try {
      const res = await fetch(`/api/endpoints/${initial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          url: form.url || null,
          api_key: form.api_key,
          access_token: form.access_token || null,
          is_active: form.is_active,
        }),
      });
      const body = await res.json();
      if (!body.ok) { setError(body.error || 'Save failed'); return; }
      setSuccess('Settings saved');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function remove() {
    if (!confirm(`Delete shop "${initial.name}" and all its pages? This cannot be undone.`)) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/endpoints/${initial.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!body.ok) { setError(body.error || 'Delete failed'); return; }
      router.push('/pages');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function cancel() {
    setForm({
      id: initial.id,
      name: initial.name,
      url: initial.url || '',
      api_key: initial.api_key,
      access_token: initial.access_token || '',
      is_active: initial.is_active,
    });
    setEditing(false);
    setError('');
    setSuccess('');
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-200">Shop Settings</h3>
        <div className="flex items-center gap-2">
          {editing ? (
            <button onClick={cancel}
              className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer">
              Cancel
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer">
                Edit
              </button>
              <button onClick={remove}
                className="text-xs px-3 py-1.5 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer">
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>}
      {success && <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>}

      {editing ? (
        <>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Shop Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Shop URL</label>
              <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">API Key *</label>
              <input type="text" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Access Token</label>
              <input type="text" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono" placeholder="eyJ..." />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ps_active" checked={form.is_active !== 0}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })}
                className="rounded border-slate-700 bg-slate-800" />
              <label htmlFor="ps_active" className="text-xs text-slate-400">Active</label>
            </div>
          </div>

          <button onClick={save}
            className="mt-4 text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 transition-colors cursor-pointer">
            Save Settings
          </button>
        </>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${initial.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-slate-200 font-medium">{initial.name}</span>
          </div>
          {initial.url && <div className="text-slate-500">URL: <span className="text-slate-400">{initial.url}</span></div>}
          <div className="text-slate-500">Key: <span className="font-mono text-slate-400">{mask(initial.api_key)}</span></div>
          {initial.access_token && <div className="text-slate-500">Token: <span className="font-mono text-slate-400">{mask(initial.access_token)}</span></div>}
          {initial.token_expires_at && <div className="text-slate-500">Expires: <span className="text-slate-400">{new Date(initial.token_expires_at).toLocaleString()}</span></div>}
        </div>
      )}
    </div>
  );
}
