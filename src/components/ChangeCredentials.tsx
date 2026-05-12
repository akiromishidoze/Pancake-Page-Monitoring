'use client';

import { useState, FormEvent } from 'react';

export function ChangeCredentials() {
  const [currentEmail, setCurrentEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_email: currentEmail,
          current_password: currentPassword,
          new_email: newEmail || undefined,
          new_password: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to update');
        return;
      }
      setSuccess('Credentials updated');
      setCurrentEmail('');
      setCurrentPassword('');
      setNewEmail('');
      setNewPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-sm font-medium text-slate-200 mb-4">Login Credentials</h3>

      {error && (
        <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Current Email</label>
          <input
            type="text"
            value={currentEmail}
            onChange={(e) => setCurrentEmail(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            placeholder="admin"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            placeholder="••••••••"
          />
        </div>
        <hr className="border-slate-800" />
        <div>
          <label className="block text-xs text-slate-400 mb-1">New Email (leave blank to keep current)</label>
          <input
            type="text"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            placeholder="admin"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">New Password (leave blank to keep current)</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            placeholder="min 4 characters"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !currentPassword}
          className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? 'Updating…' : 'Update Credentials'}
        </button>
      </form>
    </div>
  );
}
