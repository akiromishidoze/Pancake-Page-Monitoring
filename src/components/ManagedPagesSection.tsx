'use client';

import { useState } from 'react';

type PlatformPage = {
  id: string;
  endpoint_id: string;
  page_name: string;
  page_url: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export function ManagedPagesSection({ endpointId, initialPages }:
  { endpointId: string; initialPages: PlatformPage[] }
) {
  const [pages, setPages] = useState<PlatformPage[]>(initialPages);
  const [editing, setEditing] = useState<Partial<PlatformPage> | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function save(data: Partial<PlatformPage>) {
    setError('');
    setSuccess('');
    const isNew = !data.id;
    try {
      const res = await fetch(isNew ? '/api/platform-pages' : `/api/platform-pages/${data.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!body.ok) { setError(body.error || 'Save failed'); return; }
      setSuccess(isNew ? 'Page created' : 'Page updated');
      setEditing(null);
      const refresh = await fetch(`/api/platform-pages?endpoint_id=${endpointId}`);
      const refBody = await refresh.json();
      if (refBody.ok) setPages(refBody.pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this page?')) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/platform-pages/${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!body.ok) { setError(body.error || 'Delete failed'); return; }
      setSuccess('Page deleted');
      setPages((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Managed Pages</h3>
        <button
          onClick={() => setEditing({ page_name: '', endpoint_id: endpointId })}
          className="text-xs px-3 py-1.5 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 transition-colors cursor-pointer"
        >
          + Add Page
        </button>
      </div>

      {error && <div className="px-4 py-2 text-sm text-red-300 bg-red-900/10">{error}</div>}
      {success && <div className="px-4 py-2 text-sm text-green-300 bg-green-900/10">{success}</div>}

      {pages.length === 0 ? (
        <div className="p-6 text-sm text-slate-400 text-center">No pages added yet.</div>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/50">
            <tr className="text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {pages.map((p) => (
              <tr key={p.id} className="hover:bg-slate-800/30">
                <td className="px-4 py-3 text-slate-100">{p.page_name}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{p.page_url || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${p.is_active ? 'bg-green-900/40 text-green-300' : 'bg-red-900/30 text-red-400'}`}>
                    {p.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(p)} className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer">Edit</button>
                    <button onClick={() => remove(p.id)} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditing(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-4">
              {editing.id ? 'Edit Page' : 'Add Page'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Page Name *</label>
                <input type="text" value={editing.page_name ?? ''} onChange={(e) => setEditing({ ...editing, page_name: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" placeholder="My Page" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Page URL (optional)</label>
                <input type="text" value={editing.page_url ?? ''} onChange={(e) => setEditing({ ...editing, page_url: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" placeholder="https://..." />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pp_active" checked={editing.is_active !== 0}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })}
                  className="rounded border-slate-700 bg-slate-800" />
                <label htmlFor="pp_active" className="text-xs text-slate-400">Active</label>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setEditing(null)} className="text-xs px-4 py-2 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button onClick={() => save({ ...editing, endpoint_id: endpointId })}
                disabled={!editing.page_name}
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
