'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useToast } from './Toast';

export function TwoFactorSetup() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/settings');
        const d = await r.json();
        if (d.ok && d.settings?.totp_enabled === 'true') {
          setEnabled(true);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleStartSetup() {
    setError('');
    setSuccess('');
    try {
      const r = await fetch('/api/totp/setup');
      const d = await r.json();
      if (!d.ok) { setError(d.error || 'Failed to start setup'); return; }
      setSecret(d.secret);
      setQr(d.qr);
      setUri(d.uri);
      setShowSetup(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start setup');
    }
  }

  async function handleVerifySetup(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const r = await fetch('/api/totp/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || 'Verification failed'); return; }
      setSuccess('Two-factor authentication enabled');
      setEnabled(true);
      setShowSetup(false);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const r = await fetch('/api/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || 'Failed to disable 2FA'); return; }
      setSuccess('Two-factor authentication disabled');
      setEnabled(false);
      setShowDisable(false);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable 2FA');
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-sm font-medium text-slate-200 mb-1">Two-Factor Authentication</h3>
        <p className="text-xs text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-sm font-medium text-slate-200 mb-1">Two-Factor Authentication (2FA)</h3>
      <p className="text-xs text-slate-400 mb-4">
        Add an extra layer of security by requiring a one-time code from your authenticator app when signing in.
      </p>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>}
      {success && <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>}

      {enabled && !showSetup && !showDisable && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-green-400">2FA is enabled</span>
          </div>
          <button
            onClick={() => setShowDisable(true)}
            className="text-xs px-4 py-2 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
          >
            Disable 2FA
          </button>
        </div>
      )}

      {!enabled && !showSetup && (
        <button
          onClick={handleStartSetup}
          className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 transition-colors cursor-pointer"
        >
          Set up 2FA
        </button>
      )}

      {showSetup && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400">
            <p className="mb-2">
              Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy), or enter the secret manually.
            </p>
          </div>

          {qr && (
            <div className="flex justify-center">
<img src={qr} alt="TOTP QR Code" className="w-48 h-48" />
            </div>
          )}

          <div className="text-xs text-slate-400">
            <p className="mb-1">Secret: <code className="text-slate-200 bg-slate-800 px-1 rounded">{secret}</code></p>
            <p className="text-slate-500 break-all">{uri}</p>
          </div>

          <form onSubmit={handleVerifySetup} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Verify by entering the 6-digit code from your app:</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-40 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono tracking-widest"
                placeholder="000000"
                maxLength={6}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={code.length !== 6}
                className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Verify &amp; Enable
              </button>
              <button
                type="button"
                onClick={() => { setShowSetup(false); setCode(''); setError(''); }}
                className="text-xs px-4 py-2 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showDisable && (
        <form onSubmit={handleDisable} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Enter your current password to disable 2FA:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-60 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              placeholder="Current password"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!password}
              className="text-xs px-4 py-2 rounded border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Disable 2FA
            </button>
            <button
              type="button"
              onClick={() => { setShowDisable(false); setPassword(''); setError(''); }}
              className="text-xs px-4 py-2 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
