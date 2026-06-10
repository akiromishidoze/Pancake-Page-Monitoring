import Link from 'next/link';
import { Suspense } from 'react';
import { getLatestRun, getRunCount, getSetting, listEndpoints, getEndpoint, getLatestPageStates, getLatestPageStatesForEndpoints, getRecentRuns, getRunHistory, getRunHistories, getBotCakeOverrides, isBotCakeEndpoint, isPancakeEndpoint, type PageStateRow, type RunRow, type EndpointRow } from '@/lib/db';
import { StatusCard } from '@/components/StatusCard';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { RunNowButton } from '@/components/RunNowButton';
import { formatWithTz } from '@/lib/format';

export const dynamic = 'force-dynamic';
import { LiveTimeAgo } from '@/components/LiveTimeAgo';
import { ActiveDonutChart } from '@/components/ActiveDonutChart';
import { PageWaterfallChart } from '@/components/PageWaterfallChart';
import { EndpointFilter } from '@/components/EndpointFilter';
import { AlertSparkline } from '@/components/AlertSparkline';
import { ActiveTrendChart } from '@/components/ActiveTrendChart';
import { BotCakePageList } from '@/components/BotCakePageList';

type SearchParams = {
  endpoint_id?: string;
};

type StatusCardData = {
  heartbeatFresh: boolean | null;
  lastScheduledRunMs: number | null;
  runQuality: string | null;
  severity: string | null;
  canaryStatus: string | null;
  canaryAlert: boolean;
  alertCount: number;
  outageSuspected: boolean;
};

function StatusCardGrid({ data }: { data: StatusCardData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatusCard
        title="Heartbeat"
        value={data.heartbeatFresh === null ? '—' : data.heartbeatFresh ? 'FRESH' : 'STALE'}
        tone={data.heartbeatFresh === true ? 'green' : data.heartbeatFresh === false ? 'red' : 'gray'}
        subtitle={<LiveTimeAgo timestampMs={data.lastScheduledRunMs} />}
      />
      <StatusCard
        title="Run Quality"
        value={(data.runQuality ?? 'unknown').toUpperCase()}
        tone={data.runQuality === 'full' ? 'green' : data.runQuality === 'partial' ? 'yellow' : data.runQuality === 'degraded' ? 'red' : 'gray'}
        subtitle={`Severity: ${data.severity ?? '—'}`}
      />
      <StatusCard
        title="Canary"
        value={(data.canaryStatus ?? 'unknown').toUpperCase()}
        tone={data.canaryStatus === 'ok' ? 'green' : data.canaryStatus === 'down' ? 'red' : 'gray'}
        subtitle={data.canaryAlert ? 'ALERT' : '—'}
      />
      <StatusCard
        title="Alerts"
        value={String(data.alertCount)}
        tone={data.alertCount > 0 ? 'red' : 'green'}
        subtitle={data.outageSuspected ? 'Outage suspected' : 'No outage flagged'}
      />
    </div>
  );
}

async function tryDb<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

function DbErrorFallback({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6" role="alert">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <span className="text-sm font-medium text-slate-300">{label} — Unavailable</span>
      </div>
      <p className="text-xs text-slate-500">Could not load data. The database may be temporarily unreachable.</p>
    </div>
  );
}

async function PancakeSection({ endpointId, pancakeIds, allEndpoints }: { endpointId?: string; pancakeIds: string[]; allEndpoints: EndpointRow[] }) {
  try {
    let allPages: PageStateRow[];
    try {
      if (endpointId) {
        allPages = await getLatestPageStates(endpointId);
      } else if (pancakeIds.length > 0) {
        allPages = await getLatestPageStatesForEndpoints(pancakeIds);
      } else {
        allPages = [];
      }
    } catch {
      return <DbErrorFallback label="Pancake Platform" />;
    }

    if (allPages.length === 0) return null;

    const activeCount = allPages.filter((p) => p.is_activated).length;
    const inactiveCount = allPages.filter((p) => !p.is_activated).length;
    const pancakeEndpoints = allEndpoints.filter(e => isPancakeEndpoint(e) && pancakeIds.includes(e.id));

    const shopBreakdown = pancakeEndpoints.map((ep) => {
      const shopPages = allPages.filter((p) => p.shop_label === ep.shop_label);
      return {
        label: ep.shop_label ?? ep.name,
        total: shopPages.length,
        active: shopPages.filter((p) => p.is_activated).length,
        inactive: shopPages.filter((p) => !p.is_activated).length,
      };
    });

    const histories = pancakeIds.length > 0 ? await tryDb(() => getRunHistories(pancakeIds, 100), new Map()) : new Map();
    const trendSeries = pancakeEndpoints.map((ep) => {
      const history: RunRow[] = histories.get(ep.id) ?? [];
      if (history.length < 2) return null;
      return {
        label: ep.shop_label ?? ep.name,
        data: history.map(r => ({
          time: r.generated_at,
          active: r.active_pages ?? 0,
          inactive: r.inactive_pages ?? 0,
          total: r.total_pages ?? 0,
        })),
      };
    }).filter(Boolean) as { label: string; data: { time: string; active: number; inactive: number; total: number }[] }[];

    const exportHref = endpointId
      ? `/api/export?format=csv&endpoint_id=${encodeURIComponent(endpointId)}`
      : '/api/export?format=csv';

    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold text-slate-200">Pancake Platform</h3>
          <a href={exportHref} className="ml-auto rounded px-2 py-0.5 text-xs font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors">
            Export CSV
          </a>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {allPages.length} pages across {shopBreakdown.length} shops. Activity kind data requires n8n monitoring.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <ActiveDonutChart activeCount={activeCount} inactiveCount={inactiveCount} />
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900 h-[400px] flex flex-col">
              <div className="shrink-0 px-6 pt-6 pb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-200">{allPages.length}</span>
                  <span className="text-sm text-slate-400">pages total</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-6 pb-6">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="text-left text-xs uppercase text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Shop</th>
                      <th className="pb-2 pr-4 font-medium">Pages</th>
                      <th className="pb-2 pr-4 font-medium">Active</th>
                      <th className="pb-2 font-medium">Inactive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {shopBreakdown.map((s) => (
                      <tr key={s.label} className="text-slate-300">
                        <td className="py-2 pr-4">{s.label}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{s.total}</td>
                        <td className="py-2 pr-4 text-green-400 font-mono text-xs">{s.active}</td>
                        <td className="py-2 text-red-400 font-mono text-xs">{s.inactive}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        {trendSeries.length > 0 && (
          <div className="mt-6">
            <ActiveTrendChart series={trendSeries} />
          </div>
        )}
      </div>
    );
  } catch (err) {
    console.error('PancakeSection error:', err);
    return <DbErrorFallback label="Pancake Platform" />;
  }
}

async function BotCakeSection({ endpointId }: { endpointId: string }) {
  try {
    let pages: PageStateRow[];
    try {
      pages = await getLatestPageStates(endpointId);
    } catch {
      return <DbErrorFallback label="BotCake Platform" />;
    }
    if (pages.length === 0) return null;

    const [latestRun, botCakeHistory, overrides] = await Promise.all([
      tryDb(() => getLatestRun(endpointId), null),
      tryDb(() => getRunHistory(endpointId, 200), []),
      tryDb(() => getBotCakeOverrides(), new Map()),
    ]);

    const overrideMap = new Map<string, boolean>();
    for (const [pid, ov] of overrides) {
      overrideMap.set(pid, ov.is_active);
    }
    const apiHealthy = latestRun && latestRun.heartbeat_ok && !latestRun.outage_suspected;

    const activeCount = pages.filter(p => p.is_activated).length;
    const inactiveCount = pages.filter(p => !p.is_activated).length;

    const breakdown = [
      { label: 'Active (has orders)', count: pages.filter(p => p.is_activated && p.activation_reason === 'pancake-activity').length, color: 'text-green-400' },
      { label: 'Active (has conversations)', count: pages.filter(p => p.is_activated && p.activation_reason === 'has-conversations').length, color: 'text-emerald-400' },
      { label: 'Active (has tools/flows)', count: pages.filter(p => p.is_activated && p.activation_reason === 'has-tools').length, color: 'text-teal-400' },
      { label: 'Inactive (no activity)', count: pages.filter(p => !p.is_activated && p.activation_reason === 'no-activity').length, color: 'text-slate-500' },
    ].filter(b => b.count > 0);

    const botCakeTrend = botCakeHistory.length >= 2
      ? [{
          label: 'BotCake Active',
          data: botCakeHistory.map(r => ({
            time: r.generated_at,
            active: r.active_pages ?? 0,
            inactive: r.inactive_pages ?? 0,
            total: r.total_pages ?? 0,
          })),
        }]
      : [];

    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${apiHealthy ? 'bg-green-500' : 'bg-red-500'}`} title={apiHealthy ? 'API healthy' : 'API degraded'} />
            <h3 className="text-lg font-semibold text-slate-200">BotCake Platform</h3>
          </div>
          <a href={`/api/botcake-export?endpoint_id=${encodeURIComponent(endpointId)}`} className="ml-auto rounded px-2 py-0.5 text-xs font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors">
            Export CSV
          </a>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {pages.length} pages monitored via BotCake API. Active = has Pancake orders OR has BotCake conversations OR has tools/flows configured. Inactive = none.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <ActiveDonutChart activeCount={activeCount} inactiveCount={inactiveCount} />
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900 h-[400px] flex flex-col">
              <div className="shrink-0 px-6 pt-6 pb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-green-400">{activeCount}</span>
                  <span className="text-sm text-slate-400">active / {pages.length} total</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-6 pb-6">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="text-left text-xs uppercase text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Reason</th>
                      <th className="pb-2 font-medium">Pages</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {breakdown.map(b => (
                      <tr key={b.label} className="text-slate-300">
                        <td className="py-2 pr-4">{b.label}</td>
                        <td className={`py-2 font-mono text-xs ${b.color}`}>{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4">
                  <div className="text-xs text-slate-500">
                    <BotCakePageList pages={pages.map(p => ({
                      page_id: p.page_id,
                      page_name: p.page_name,
                      is_activated: p.is_activated,
                      activation_reason: p.activation_reason,
                      hours_since_last_customer_activity: p.hours_since_last_customer_activity,
                      customer_count: p.customer_count,
                    }))} overrides={overrideMap} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {botCakeTrend.length > 0 && (
          <div className="mt-6">
            <ActiveTrendChart series={botCakeTrend} />
          </div>
        )}
      </div>
    );
  } catch (err) {
    console.error('BotCakeSection error:', err);
    return <DbErrorFallback label="BotCake Platform" />;
  }
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const endpointId = sp.endpoint_id;

  let endpoint: EndpointRow | null = null;
  try { endpoint = (endpointId ? await getEndpoint(endpointId) : null) ?? null; } catch { /* unavailable */ }

  let localRun = null;
  let recentRuns: RunRow[] = [];
  let totalRunCount = 0;
  let lastScheduledRunMs: number | null = null;
  let allEndpoints: EndpointRow[] = [];

  try {
    [localRun, recentRuns, , totalRunCount, lastScheduledRunMs, allEndpoints] = await Promise.all([
      getLatestRun(endpointId),
      getRecentRuns(50, endpointId),
      getRunCount(endpointId),
      getRunCount(),
      getSetting('last_scheduled_run').then(s => s ? parseInt(s, 10) : null),
      listEndpoints(),
    ]);
  } catch {
    // DB unavailable — use empty fallbacks
  }

  const pancakeIds = allEndpoints.filter(isPancakeEndpoint).map(e => e.id);
  const botcakeEndpointIds = allEndpoints.filter(isBotCakeEndpoint).map(e => e.id);
  const endpoints = allEndpoints.map((ep) => ({ id: ep.id, name: ep.name }));

  const isFiltered = !!endpointId;
  const isBotCakeFilter = endpoint ? isBotCakeEndpoint(endpoint) : false;
  const isPancakeShop = isFiltered && !isBotCakeFilter;

  const lastUpdatedDisplay = localRun
    ? formatWithTz(localRun.received_at)
    : '—';

  const cardData: StatusCardData = {
    heartbeatFresh: localRun ? localRun.heartbeat_ok : null,
    lastScheduledRunMs,
    runQuality: localRun?.run_quality ?? null,
    severity: localRun?.severity ?? null,
    canaryStatus: localRun?.canary_status ?? null,
    canaryAlert: localRun?.canary_alert ?? false,
    alertCount: localRun?.alert_count ?? 0,
    outageSuspected: localRun?.outage_suspected ?? false,
  };

  const runId = localRun?.run_id ?? null;
  const ruleVersion = localRun?.rule_version ?? null;
  const inMaintenance = localRun?.in_maintenance_window;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Overview</h2>
            <EndpointFilter endpoints={endpoints} />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Last updated {lastUpdatedDisplay}
          </p>
        </div>
        <RunNowButton />
      </div>

      <div className="dashboard-data space-y-6">
        {!isFiltered && (
          <>
            <SectionErrorBoundary title="Status Cards">
              <StatusCardGrid data={cardData} />
            </SectionErrorBoundary>

            {recentRuns.length > 1 && (
              <SectionErrorBoundary title="Alert Trend">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 flex items-center gap-4">
                  <div className="text-xs text-slate-400 uppercase shrink-0">Alert Trend (last {recentRuns.length} runs)</div>
                  <AlertSparkline runs={recentRuns.map(r => ({ alert_count: r.alert_count ?? 0, generated_at: r.generated_at }))} />
                  <div className="text-xs text-slate-500">Red dots = alerts</div>
                </div>
              </SectionErrorBoundary>
            )}

            <div className="space-y-8">
              <SectionErrorBoundary title="Pancake Section">
                <Suspense fallback={<div className="rounded-lg border border-slate-800 bg-slate-900 p-6 animate-pulse"><div className="h-5 w-40 rounded bg-slate-800" /><div className="mt-4 h-48 rounded bg-slate-800" /></div>}>
                  <PancakeSection pancakeIds={pancakeIds} allEndpoints={allEndpoints} />
                </Suspense>
              </SectionErrorBoundary>
              {botcakeEndpointIds.length > 0 && botcakeEndpointIds.map(id => (
                <SectionErrorBoundary key={id} title={`BotCake ${id}`}>
                  <Suspense fallback={<div className="rounded-lg border border-slate-800 bg-slate-900 p-6 animate-pulse"><div className="h-5 w-40 rounded bg-slate-800" /><div className="mt-4 h-48 rounded bg-slate-800" /></div>}>
                    <BotCakeSection endpointId={id} />
                  </Suspense>
                </SectionErrorBoundary>
              ))}
            </div>

            <SectionErrorBoundary title="Database Stats">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
                  <h3 className="text-sm font-medium text-slate-400 uppercase">Database</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Total runs</dt>
                      <dd className="font-mono">{totalRunCount}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Platforms</dt>
                      <dd className="font-mono">{endpoints.length}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Last run ID</dt>
                      <dd className="font-mono text-xs">{runId ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Ingest endpoint</dt>
                      <dd className="font-mono text-xs">POST /api/ingest</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
                  <h3 className="text-sm font-medium text-slate-400 uppercase">Token Expiry</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    {allEndpoints.filter(e => e.token_expires_at).length === 0 && (
                      <div className="text-xs text-slate-500">No token expiry dates set</div>
                    )}
                    {allEndpoints.filter(e => e.token_expires_at).map(ep => {
                      const diffMs = new Date(ep.token_expires_at!).getTime() - Date.now();
                      const diffDays = Math.round(diffMs / 86400000);
                      const tone = diffMs < 0 ? 'text-red-400' : diffDays <= 7 ? 'text-yellow-400' : 'text-green-400';
                      const dot = diffMs < 0 ? 'bg-red-500' : diffDays <= 7 ? 'bg-yellow-500' : 'bg-green-500';
                      return (
                        <div key={ep.id} className="flex justify-between items-center">
                          <dt className="text-slate-400">{ep.name}</dt>
                          <dd className={`font-mono ${tone} flex items-center gap-1.5`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                            {diffMs < 0 ? `expired` : `${diffDays}d`}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
                  <h3 className="text-sm font-medium text-slate-400 uppercase">Run details</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Run ID</dt>
                      <dd className="font-mono text-xs">{runId ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Rule version</dt>
                      <dd className="font-mono">v{ruleVersion ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">In maintenance</dt>
                      <dd className="font-mono">{inMaintenance ? 'YES' : 'no'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Data source</dt>
                      <dd className="font-mono text-xs">{localRun?.endpoint_id ? (botcakeEndpointIds.includes(localRun.endpoint_id) ? 'BotCake API' : 'Pancake / Ingest') : '—'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </SectionErrorBoundary>
          </>
        )}

        {isPancakeShop && (
          <>
            <SectionErrorBoundary title="Status Cards">
              <StatusCardGrid data={cardData} />
            </SectionErrorBoundary>
            <SectionErrorBoundary title="Pancake Section">
              <Suspense fallback={<div className="rounded-lg border border-slate-800 bg-slate-900 p-6 animate-pulse"><div className="h-5 w-40 rounded bg-slate-800" /><div className="mt-4 h-48 rounded bg-slate-800" /></div>}>
                <PancakeSection endpointId={endpointId} pancakeIds={pancakeIds} allEndpoints={allEndpoints} />
              </Suspense>
            </SectionErrorBoundary>
          </>
        )}

        {isBotCakeFilter && endpointId && (
          <>
            <SectionErrorBoundary title="Status Cards">
              <StatusCardGrid data={cardData} />
            </SectionErrorBoundary>
            <SectionErrorBoundary title="BotCake Section">
              <Suspense fallback={<div className="rounded-lg border border-slate-800 bg-slate-900 p-6 animate-pulse"><div className="h-5 w-40 rounded bg-slate-800" /><div className="mt-4 h-48 rounded bg-slate-800" /></div>}>
                <BotCakeSection endpointId={endpointId} />
              </Suspense>
            </SectionErrorBoundary>
          </>
        )}
      </div>
    </div>
  );
}
