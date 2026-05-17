import { getPageHistory } from '@/lib/db';
import Link from 'next/link';
import { LiveTimeAgo } from '@/components/LiveTimeAgo';
import { ActiveDonutChart } from '@/components/ActiveDonutChart';
import { PageWaterfallChart } from '@/components/PageWaterfallChart';
import type { SlimPage } from '@/lib/db';

function formatDurationSeconds(sec: number) {
  if (sec <= 0) return '0s';
  const days = Math.floor(sec / 86400);
  sec %= 86400;
  const hours = Math.floor(sec / 3600);
  sec %= 3600;
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(' ');
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ page_id: string }>;
  searchParams?: Promise<{ shop?: string }>;
}) {
  const resolvedParams = await params;
  const pageId = resolvedParams.page_id;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const shopFilter = resolvedSearch?.shop;
  let rows = await getPageHistory(pageId, 5000);

  if (!rows || rows.length === 0) {
    // No history yet — data will appear once the poller or an external system
    // pushes snapshots via /api/ingest.
  }

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

  // Optionally filter to shop if requested
  if (shopFilter) rows = rows.filter(r => (r.shop_label ?? r.shop_label) === shopFilter);

  // rows are ordered ASC by generated_at
  const latest = rows[rows.length - 1];

  // Compute uptime/inactivity durations by walking samples
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

  // SLA scoring: simple bands
  const sla = pctActive >= 99 ? 'Good' : pctActive >= 95 ? 'Warning' : 'Poor';

  // Compute rolling uptime for common windows (24h, 7d, 30d)
  function computeWindowUptime(rowData: typeof rows, windowSeconds: number) {
    const windowStart = now - windowSeconds * 1000;
    let active = 0;
    let totalSec = 0;
    for (let i = 0; i < rowData.length; i++) {
      const cur = rowData[i];
      const tcur = Date.parse(cur.generated_at);
      const tnext = i < rowData.length - 1 ? Date.parse(rowData[i + 1].generated_at) : now;
      if (isNaN(tcur) || isNaN(tnext)) continue;
      if (tnext < windowStart) continue;
      const start = Math.max(tcur, windowStart);
      const end = Math.min(tnext, now);
      const delta = Math.max(0, Math.floor((end - start) / 1000));
      if (cur.is_activated === 1) active += delta;
      totalSec += delta;
    }
    const pct = totalSec === 0 ? 0 : Math.round((active / totalSec) * 100);
    return { pct, activeSeconds: active, totalSeconds: totalSec };
  }

  const uptime24 = computeWindowUptime(rows, 24 * 3600);
  const uptime7d = computeWindowUptime(rows, 7 * 24 * 3600);
  const uptime30d = computeWindowUptime(rows, 30 * 24 * 3600);

  // Derive incidents and MTTR / MTBF from state transitions in the history
  type Incident = { startMs: number; endMs: number | null; durationSec: number | null; reason?: string | null; severity?: string; sla_breach?: boolean };
  const incidents: Incident[] = [];
  let pendingStart: number | null = null;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const tPrev = Date.parse(prev.generated_at);
    const tCur = Date.parse(cur.generated_at);
    if (isNaN(tPrev) || isNaN(tCur)) continue;

    // active -> inactive : incident start
    if (prev.is_activated === 1 && cur.is_activated !== 1) {
      pendingStart = tCur;
    }

    // inactive -> active : incident end
    if (prev.is_activated !== 1 && cur.is_activated === 1) {
      if (pendingStart === null) {
        // If we didn't record start, use prev timestamp as heuristic
        pendingStart = tPrev;
      }
      const end = tCur;
      const dur = Math.max(0, Math.floor((end - pendingStart) / 1000));
      incidents.push({ startMs: pendingStart, endMs: end, durationSec: dur, reason: cur.activation_reason ?? cur.state_change ?? null });
      pendingStart = null;
    }
  }
  // If there's an open incident at the end of history, close it at 'now'
  if (pendingStart !== null) {
    const dur = Math.max(0, Math.floor((now - pendingStart) / 1000));
    incidents.push({ startMs: pendingStart, endMs: now, durationSec: dur, reason: null });
  }

  // Assign severity to incidents and flag SLA breach (basic heuristic)
  for (const it of incidents) {
    const d = it.durationSec ?? 0;
    if (d >= 3600) it.severity = 'critical';
    else if (d >= 300) it.severity = 'major';
    else if (d >= 60) it.severity = 'minor';
    else it.severity = 'info';
    // SLA breach: if 24h uptime below 99% and incident lasted > 1 minute
    it.sla_breach = uptime24.pct < 99 && (it.durationSec ?? 0) >= 60;
  }

  // Aggregate MTTR (mean time to repair) = mean downtime of incidents
  const downtimes = incidents.map((it) => it.durationSec ?? 0).filter((d) => d > 0);
  const MTTRsec = downtimes.length ? Math.round(downtimes.reduce((a, b) => a + b, 0) / downtimes.length) : null;

  // MTBF (mean time between failures) = mean uptime between incident end and next start
  const uptimesBetween: number[] = [];
  for (let i = 0; i < incidents.length - 1; i++) {
    const cur = incidents[i];
    const next = incidents[i + 1];
    if (cur.endMs && next.startMs) {
      const up = Math.max(0, Math.floor((next.startMs - cur.endMs) / 1000));
      uptimesBetween.push(up);
    }
  }
  const MTBFsec = uptimesBetween.length ? Math.round(uptimesBetween.reduce((a, b) => a + b, 0) / uptimesBetween.length) : null;

  // Recent incidents (most recent first)
  const recentIncidents = incidents.slice(-10).reverse();

  // Flapping detector: count state changes in recent windows (1h, 24h)
  const nowMs = Date.now();
  const start1h = nowMs - 3600 * 1000;
  const start24h = nowMs - 24 * 3600 * 1000;
  let changes1h = 0;
  let changes24h = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const tPrev = Date.parse(prev.generated_at);
    const tCur = Date.parse(cur.generated_at);
    if (isNaN(tPrev) || isNaN(tCur)) continue;
    if (prev.is_activated !== cur.is_activated) {
      if (tCur >= start1h) changes1h++;
      if (tCur >= start24h) changes24h++;
    }
  }
  const flapping = changes1h >= 3 || changes24h >= 10;

  // For activity charts: produce counts from latest snapshot if present
  const activePages = rows.filter(r => r.is_activated === 1).map(r => ({
    name: r.page_name ?? '—',
    page_id: r.page_id,
    kind: r.activity_kind ?? r.activity_kind,
    shop_label: r.shop_label ?? r.shop_label,
  }));
  const inactivePages = rows.filter(r => r.is_activated !== 1).map(r => ({
    name: r.page_name ?? '—',
    page_id: r.page_id,
    kind: r.activity_kind ?? r.activity_kind,
    shop_label: r.shop_label ?? r.shop_label,
  }));

  // Response-time metrics: use only persisted response_ms values from page_states (real data only)
  const samplesMs: number[] = rows.map((r) => (typeof r.response_ms === 'number' ? r.response_ms : null)).filter((v): v is number => v !== null);

  function percentile(arr: number[], p: number) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * s.length) - 1;
    return s[Math.max(0, Math.min(s.length - 1, idx))];
  }

  const p50ms = percentile(samplesMs, 50);
  const p95ms = percentile(samplesMs, 95);
  const sampleCount = samplesMs.length;

  // Failure / error rates from persisted page_states.fetch_errors
  const failureCount = rows.filter(r => typeof r.fetch_errors === 'number' && r.fetch_errors > 0).length;
  const totalFailures = rows.reduce((acc, r) => acc + (typeof r.fetch_errors === 'number' ? r.fetch_errors : 0), 0);
  const failureRatePct = rows.length ? Math.round((failureCount / rows.length) * 100) : 0;
  const lastFailureRow = rows.slice().reverse().find(r => typeof r.fetch_errors === 'number' && r.fetch_errors > 0);
  const lastFailureAt = lastFailureRow ? Date.parse(lastFailureRow.generated_at) : null;

  // Sparkline over last 24h using persisted response_ms in rows
  const last24Start = Date.now() - 24 * 3600 * 1000;
  const rtSamples24 = rows.filter(r => {
    const ts = Date.parse(r.generated_at);
    return !isNaN(ts) && ts >= last24Start && typeof r.response_ms === 'number';
  }).map(r => r.response_ms as number);

  let sparklinePath: string | null = null;
  const sparklineWidth = 140;
  const sparklineHeight = 36;
  if (rtSamples24.length) {
    const s = rtSamples24.slice();
    const minV = Math.min(...s);
    const maxV = Math.max(...s);
    const range = Math.max(1, maxV - minV);
    const step = sparklineWidth / Math.max(1, s.length - 1);
    const points = s.map((v, i) => {
      const x = Math.round(i * step);
      const y = Math.round(sparklineHeight - ((v - minV) / range) * (sparklineHeight - 4) - 2);
      return { x, y };
    });
    sparklinePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  const exportHref = `/api/pages/${encodeURIComponent(pageId)}/export${shopFilter ? `?shop=${encodeURIComponent(shopFilter)}` : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Page metrics</h2>
          <p className="text-sm text-slate-400 mt-1">{latest.page_name ?? '—'} — {latest.shop_label ?? '—'}</p>
        </div>
        <div className="flex items-center gap-4">
          <LiveTimeAgo timestampMs={Date.parse(latest.generated_at)} />
          <Link href="/pages" className="text-sm text-slate-400 underline">Back to pages</Link>
          <a href={exportHref} className="text-sm text-slate-400 underline">Export CSV</a>
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
          <div className="text-xs text-slate-400 mt-3">SLA: <span className="font-semibold">{sla}</span></div>
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div>
            <ActiveDonutChart activeCount={activePages.length} inactiveCount={inactivePages.length} />
          </div>
          <div>
            <PageWaterfallChart activePages={activePages as SlimPage[]} inactivePages={inactivePages as SlimPage[]} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Rolling uptime</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-sm font-semibold">24h</div>
              <div className="text-lg font-bold mt-1">{uptime24.pct}%</div>
              <div className="text-xs text-slate-400 mt-1">Active {formatDurationSeconds(uptime24.activeSeconds)}</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold">7d</div>
              <div className="text-lg font-bold mt-1">{uptime7d.pct}%</div>
              <div className="text-xs text-slate-400 mt-1">Active {formatDurationSeconds(uptime7d.activeSeconds)}</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold">30d</div>
              <div className="text-lg font-bold mt-1">{uptime30d.pct}%</div>
              <div className="text-xs text-slate-400 mt-1">Active {formatDurationSeconds(uptime30d.activeSeconds)}</div>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-400">MTTR: <span className="font-semibold">{MTTRsec ? formatDurationSeconds(MTTRsec) : '—'}</span></div>
          <div className="text-xs text-slate-400">MTBF: <span className="font-semibold">{MTBFsec ? formatDurationSeconds(MTBFsec) : '—'}</span></div>
        </div>

        <div className="col-span-2 dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-sm text-slate-200 font-medium mb-3">Recent incidents</div>
          {recentIncidents.length === 0 ? (
            <div className="text-sm text-slate-400">No incidents detected in history.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-800/50">
                          <tr className="text-left text-xs uppercase text-slate-400">
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recentIncidents.map((it, idx) => (
                    <tr key={`${it.startMs}-${idx}`} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-slate-300">{new Date(it.startMs).toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-200">{it.durationSec ? formatDurationSeconds(it.durationSec) : '—'}</td>
                      <td className="px-3 py-2">
                        {it.severity === 'critical' ? (
                          <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-red-900/40 text-red-300 border border-red-800">critical</span>
                        ) : it.severity === 'major' ? (
                          <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-amber-900/30 text-amber-300 border border-amber-800">major</span>
                        ) : it.severity === 'minor' ? (
                          <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-yellow-900/30 text-yellow-300 border border-yellow-800">minor</span>
                        ) : (
                          <span className="inline-block px-2 py-1 rounded text-xs font-mono bg-slate-800/30 text-slate-400 border border-slate-700">info</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{it.reason ?? '—'}{it.sla_breach ? (<span className="ml-2 text-xs text-red-400 font-medium">SLA</span>) : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Response time</div>
          <div className="mt-2">
            {sampleCount === 0 ? (
              <div className="text-sm text-slate-400">No persisted response-time data</div>
            ) : (
              <>
                <div className="mt-2 text-lg font-bold">p50: <span className="ml-2 text-slate-200">{p50ms ? (p50ms < 1000 ? `${Math.round(p50ms)} ms` : `${(p50ms/1000).toFixed(1)} s`) : '—'}</span></div>
                <div className="text-lg font-bold mt-1">p95: <span className="ml-2 text-slate-200">{p95ms ? (p95ms < 1000 ? `${Math.round(p95ms)} ms` : `${(p95ms/1000).toFixed(1)} s`) : '—'}</span></div>
                {sparklinePath ? (
                  <div className="mt-3">
                    <svg width={sparklineWidth} height={sparklineHeight} viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`} className="rounded bg-slate-800/20">
                      <path d={sparklinePath} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : null}
                <div className="text-xs text-slate-400 mt-3">Source: persisted measurements only</div>
              </>
            )}
          </div>
        </div>

        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs text-slate-400">Failure / error rate</div>
          <div className="mt-2">
            {rows.length === 0 ? (
              <div className="text-sm text-slate-400">No history</div>
            ) : (
              <>
                <div className="text-lg font-bold">{failureRatePct}%</div>
                <div className="text-sm text-slate-400 mt-1">Failure samples: <span className="font-semibold">{failureCount}</span></div>
                <div className="text-sm text-slate-400">Total failures: <span className="font-semibold">{totalFailures}</span></div>
                <div className="text-xs text-slate-400 mt-3">Last failure: {lastFailureAt ? <LiveTimeAgo timestampMs={lastFailureAt} /> : '—'}</div>
                <div className="text-xs text-slate-400 mt-2">Source: persisted fetch_errors on page_states</div>
              </>
            )}
          </div>
        </div>

        <div />
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
                <th className="px-3 py-2">Customers</th>
                <th className="px-3 py-2">Shop</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.slice(-500).reverse().map((r, i) => (
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
                  <td className="px-3 py-2 text-slate-400 font-mono">{r.customer_count ?? '—'}</td>
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