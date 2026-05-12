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

export function PlatformSettings({ endpoint: initial }: { endpoint: Endpoint }) {
  const router = useRouter();
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

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-200">Shop Settings</h3>
        <button onClick={remove}
          className="text-xs px-3 py-1.5 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer">
          Delete Shop
        </button>
      </div>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>}
      {success && <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>}

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
    </div>
  );
}
