'use client';

// "Run Now" button — POSTs to /api/run, shows feedback, refreshes the page on success.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Status =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'success'; message: string; triggeredAt: string }
  | { phase: 'error'; error: string };

export function RunNowButton() {
  const [status, setStatus] = useState<Status>({ phase: 'idle' });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick() {
    setStatus({ phase: 'running' });
    try {
      const res = await fetch('/api/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ phase: 'error', error: data.error || `HTTP ${res.status}` });
        return;
      }
      setStatus({
        phase: 'success',
        message: data.message || 'Run triggered',
        triggeredAt: data.triggered_at || new Date().toISOString(),
      });
      // Auto-refresh after ~75s so the n8n workflow has time to complete (~30s) and the
      // dashboard's 60s poller has time to insert the new run into SQLite.
      setTimeout(() => {
        startTransition(() => router.refresh());
      }, 75_000);
    } catch (e) {
      setStatus({
        phase: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const disabled = status.phase === 'running' || isPending;
  const label =
    status.phase === 'running'
      ? 'Triggering…'
      : isPending
        ? 'Refreshing…'
        : status.phase === 'success'
          ? 'Run triggered ✓'
          : 'Run Now';

  return (
    <div className="flex flex-col gap-1 items-end">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer
          ${disabled
            ? 'border-slate-700 bg-slate-800 text-slate-400 cursor-not-allowed'
            : status.phase === 'success'
              ? 'border-green-700 bg-green-900/40 text-green-300 hover:bg-green-900/60'
              : status.phase === 'error'
                ? 'border-red-800 bg-red-900/40 text-red-300 hover:bg-red-900/60'
                : 'border-blue-700 bg-blue-900/40 text-blue-300 hover:bg-blue-800/60'
          }
        `}
      >
        {status.phase === 'running' && (
          <span
            className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden
          />
        )}
        <span>{label}</span>
      </button>

      {status.phase === 'success' && (
        <span className="text-xs text-slate-400 max-w-xs text-right">
          {status.message} Auto-refresh in ~75s.
        </span>
      )}
      {status.phase === 'error' && (
        <span className="text-xs text-red-400 max-w-xs text-right">
          Error: {status.error}
        </span>
      )}
    </div>
  );
}
