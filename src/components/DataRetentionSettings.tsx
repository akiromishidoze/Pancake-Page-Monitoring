'use client';

import { useState, useEffect, FormEvent } from 'react';

export function DataRetentionSettings() {
  const [days, setDays] = useState('90');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.settings?.retention_days) {
          setDays(d.settings.retention_days);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retention_days: days }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to save'); return; }
      setSuccess(`Retention set to ${days} days`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  async function handlePrune() {
    if (!confirm(`Prune all runs older than ${days} days? This cannot be undone.`)) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/prune', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retention_days: parseInt(days, 10) }) });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Prune failed'); return; }
      setSuccess(`Pruned ${data.deleted} runs older than ${days} days`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prune failed');
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-sm font-medium text-slate-200 mb-1">Data Retention</h3>
      <p className="text-xs text-slate-400 mb-4">
        Automatically prune runs older than the specified number of days. Runs are checked every 6 hours.
      </p>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>}
      {success && <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Retention Period (days)</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-32 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              min="1"
              max="3650"
            />
            <span className="text-xs text-slate-500">0 to disable auto-prune</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handlePrune}
            className="text-xs px-4 py-2 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
          >
            Prune Now
          </button>
        </div>
      </form>
    </div>
  );
}
