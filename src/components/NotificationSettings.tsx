'use client';

import { useState, useEffect, FormEvent } from 'react';

export function NotificationSettings() {
  const [slackWebhook, setSlackWebhook] = useState('');
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/notify-settings')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setConfigured(d.slack_configured);
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
      const res = await fetch('/api/notify-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_webhook: slackWebhook }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      setSuccess('Notification settings saved');
      setConfigured(!!slackWebhook);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-sm font-medium text-slate-200 mb-1">Notifications</h3>
      <p className="text-xs text-slate-400 mb-4">
        Get alerted when canary goes down, outage is suspected, or alerts are triggered.
        {configured && <span className="text-green-400 ml-2">Slack configured ✓</span>}
      </p>

      {error && (
        <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Slack Webhook URL</label>
          <input
            type="text"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono"
            placeholder="https://hooks.slack.com/services/..."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
          {slackWebhook && (
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/notify-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ slack_webhook: '' }),
                });
                setSlackWebhook('');
                setConfigured(false);
                setSuccess('Webhook removed');
              }}
              className="text-xs px-3 py-1.5 rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
