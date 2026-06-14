'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useToast } from './Toast';

export function NotificationSettings() {
  const [slackWebhook, setSlackWebhook] = useState('');
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/notify-settings');
        const d = await r.json();
        if (d.ok) {
          setConfigured(d.slack_configured);
          setSmtpHost(d.smtp_host || '');
          setSmtpPort(d.smtp_port || '587');
          setSmtpUser(d.smtp_user || '');
          setEmailFrom(d.email_from || '');
          setEmailTo(d.email_to || '');
          setEmailConfigured(d.email_configured);
        }
      } catch {
        toast('Failed to load notification settings');
      }
    })();
  }, [toast]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/notify-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slack_webhook: slackWebhook,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_user: smtpUser,
          smtp_pass: smtpPass,
          email_from: emailFrom,
          email_to: emailTo,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      setSuccess('Notification settings saved');
      setConfigured(!!slackWebhook);
      setEmailConfigured(!!(smtpHost && smtpUser && emailTo));
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
        {emailConfigured && <span className="text-green-400 ml-2">Email configured ✓</span>}
      </p>

      {error && (
        <div className="mb-3 rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="mb-3 rounded border border-green-800 bg-green-900/20 p-2 text-sm text-green-300">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="text-xs font-medium text-slate-400 uppercase tracking-wide">Slack</legend>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Webhook URL</label>
            <input
              type="text"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono"
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>
          <div className="flex items-center gap-3">
            {configured && (
              <button
                type="button"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  setError('');
                  setSuccess('');
                  try {
                    const res = await fetch('/api/test-notification', { method: 'POST' });
                    const data = await res.json();
                    if (data.ok) setSuccess('Test notification sent to Slack');
                    else setError(data.error || 'Test failed');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Test failed');
                  } finally {
                    setTesting(false);
                  }
                }}
                className="text-xs px-3 py-1.5 rounded border border-green-700 bg-green-900/20 text-green-300 hover:bg-green-800/30 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {testing ? 'Sending…' : 'Test Slack'}
              </button>
            )}
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
        </fieldset>

        <hr className="border-slate-800" />

        <fieldset className="space-y-3">
          <legend className="text-xs font-medium text-slate-400 uppercase tracking-wide">SMTP / Email</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">SMTP Host</label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono"
                placeholder="smtp.gmail.com"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Port</label>
              <input
                type="text"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono"
                placeholder="587"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">SMTP Username</label>
            <input
              type="text"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              placeholder="user@gmail.com"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">SMTP Password</label>
            <input
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono"
              placeholder="App password"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">From Address</label>
              <input
                type="email"
                value={emailFrom}
                onChange={(e) => setEmailFrom(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                placeholder="monitor@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">To Address</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                placeholder="admin@example.com"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {emailConfigured && (
              <button
                type="button"
                disabled={testingEmail}
                onClick={async () => {
                  setTestingEmail(true);
                  setError('');
                  setSuccess('');
                  try {
                    const res = await fetch('/api/test-email-notification', { method: 'POST' });
                    const data = await res.json();
                    if (data.ok) setSuccess('Test email notification sent');
                    else setError(data.error || 'Test failed');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Test failed');
                  } finally {
                    setTestingEmail(false);
                  }
                }}
                className="text-xs px-3 py-1.5 rounded border border-green-700 bg-green-900/20 text-green-300 hover:bg-green-800/30 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {testingEmail ? 'Sending…' : 'Test Email'}
              </button>
            )}
          </div>
        </fieldset>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="text-xs px-4 py-2 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </form>
    </div>
  );
}
