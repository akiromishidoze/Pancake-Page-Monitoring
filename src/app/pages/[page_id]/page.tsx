import { getPageHistory } from '@/lib/db';
import Link from 'next/link';
import { LiveTimeAgo } from '@/components/LiveTimeAgo';

function formatDurationSeconds(sec: number) {
  if (sec <= 0) return '0s';
  const days = Math.floor(sec / 86400);
  sec %= 86400;
  const hours = Math.floor(sec / 3600);
  sec %= 3600;
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(' ');
}

export default async function Page({ params }: { params: { page_id: string } }) {
  const pageId = params.page_id;
  const rows = getPageHistory(pageId, 2000);

  if (!rows || rows.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Page metrics</h2>
          <Link href="/pages" className="text-sm text-slate-400 underline">Back to pages</Link>
        </div>
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
          No history found for this page.
        </div>
      </div>
    );
  }

  // rows are ordered ASC by generated_at
  const latest = rows[rows.length - 1];
  let activeSeconds = 0;
  let inactiveSeconds = 0;

  for (let i = 0; i < rows.length - 1; i++) {
    const cur = rows[i];
    const next = rows[i + 1];
    const tcur = Date.parse(cur.generated_at);
    const tnext = Date.parse(next.generated_at);
    if (isNaN(tcur) || isNaN(tnext)) continue;
    const delta = Math.max(0, Math.floor((tnext - tcur) / 1000));
    if (cur.is_activated === 1) activeSeconds += delta;
    else inactiveSeconds += delta;
  }

  // last sample -> until now
  const lastTs = Date.parse(latest.generated_at);
  const now = Date.now();
  if (!isNaN(lastTs)) {
    const delta = Math.max(0, Math.floor((now - lastTs) / 1000));
    if (latest.is_activated === 1) activeSeconds += delta;
    else inactiveSeconds += delta;
  }

  const total = activeSeconds + inactiveSeconds || 1;
  const pctActive = Math.round((activeSeconds / total) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Page metrics</h2>
          <p className="text-sm text-slate-400 mt-1">
            {latest.page_name ?? '—'} — {latest.shop_label ?? '—'}
          </p>
        </div>
        <div className="text-sm text-slate-400">
          <LiveTimeAgo timestampMs={Date.parse(latest.generated_at)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Current status</div>
          <div className="mt-2 text-lg font-semibold">
            {latest.is_activated === 1 ? (
              <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-green-900/40 text-green-300 border border-green-800">active</span>
            ) : (
              <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-red-900/30 text-red-400 border border-red-900">inactive</span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-2">Activity: {latest.activity_kind ?? '—'}</div>
          <div className="text-xs text-slate-400">Shop: {latest.shop_label ?? '—'}</div>
        </div>

        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-4 col-span-2">
          <div className="text-xs text-slate-400">Uptime (based on stored snapshots)</div>
          <div className="mt-2 flex items-baseline gap-4">
            <div className="text-2xl font-semibold">{formatDurationSeconds(activeSeconds)}</div>
            <div className="text-sm text-slate-400">active • {pctActive}%</div>
            <div className="text-sm text-slate-400">inactive: {formatDurationSeconds(inactiveSeconds)}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="text-sm text-slate-200 font-medium mb-3">Recent history</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">Shop</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.slice(-200).reverse().map((r, i) => (
                <tr key={`${r.id}-${i}`} className="hover:bg-slate-800/30">
                  <td className="px-3 py-2 text-slate-300">{new Date(r.generated_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {r.is_activated === 1 ? (
                      <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-green-900/40 text-green-300 border border-green-800">active</span>
                    ) : (
                      <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-red-900/30 text-red-400 border border-red-900">inactive</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-200">{r.activity_kind ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-200">{r.shop_label ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-400">{r.activation_reason ?? r.state_change ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}