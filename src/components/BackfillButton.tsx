'use client';

import { useState } from 'react';

type Phase =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; inserted: number; skipped: number; errors: number; total: number }
  | { phase: 'error'; error: string };

export function BackfillButton() {
  const [status, setStatus] = useState<Phase>({ phase: 'idle' });

  async function handleClick() {
    setStatus({ phase: 'running' });
    try {
      const res = await fetch('/api/backfill', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        setStatus({ phase: 'error', error: data.error || 'Unknown error' });
        return;
      }
      setStatus({
        phase: 'done',
        inserted: data.inserted ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? 0,
        total: data.total ?? 0,
      });
    } catch (e) {
      setStatus({
        phase: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      {status.phase === 'idle' && (
        <button
          onClick={handleClick}
          className="text-xs px-3 py-1.5 rounded border border-amber-700 bg-amber-900/30 text-amber-300 hover:bg-amber-800/40 transition-colors cursor-pointer"
        >
          Backfill History
        </button>
      )}

      {status.phase === 'running' && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          Backfilling historical data…
        </div>
      )}

      {status.phase === 'done' && (
        <div className="text-xs text-slate-400">
          Backfill complete: <span className="text-green-400">{status.inserted} new</span>
          {status.skipped > 0 && <span className="text-slate-500">, {status.skipped} duplicates</span>}
          {status.errors > 0 && <span className="text-red-400">, {status.errors} errors</span>}
          {' '}of {status.total} snapshots.
        </div>
      )}

      {status.phase === 'error' && (
        <div className="text-xs text-red-400">
          Backfill error: {status.error}
        </div>
      )}
    </div>
  );
}
