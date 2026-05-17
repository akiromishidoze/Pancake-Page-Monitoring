import Link from 'next/link';
import { getLatestRun, getRunCount, getSetting, listEndpoints, getEndpoint, getLatestPageStates, getRecentRuns, getRunHistory, getBotCakeOverrides, type PageStateRow } from '@/lib/db';
import { StatusCard } from '@/components/StatusCard';
import { RunNowButton } from '@/components/RunNowButton';
import { RunStatusIndicator } from '@/components/RunStatusIndicator';
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

const PANCAKE_ENDPOINT_IDS = ['430202960', '1635192689', '1942241731'];

async function PancakeSection({ endpointId }: { endpointId?: string }) {
  let allPages: PageStateRow[] = [];
  if (endpointId) {
    allPages = await getLatestPageStates(endpointId);
  } else {
    for (const eid of PANCAKE_ENDPOINT_IDS) {
      allPages.push(...(await getLatestPageStates(eid)));
    }
  }

  if (allPages.length === 0) return null;

  const activeCount = allPages.filter((p) => p.is_activated === 1).length;
  const inactiveCount = allPages.filter((p) => p.is_activated !== 1).length;

  const rawBreakdown = await Promise.all(PANCAKE_ENDPOINT_IDS.map(async (eid) => {
    const ep = await getEndpoint(eid);
    if (!ep) return null;
    const shopPages = allPages.filter((p) => p.shop_label === ep.shop_label);
    return {
      label: ep.shop_label ?? ep.name,
      total: shopPages.length,
      active: shopPages.filter((p) => p.is_activated === 1).length,
      inactive: shopPages.filter((p) => p.is_activated !== 1).length,
    };
  }));
  const shopBreakdown = rawBreakdown.filter(Boolean) as NonNullable<typeof rawBreakdown[number]>[];

  const trendSeries = (await Promise.all(PANCAKE_ENDPOINT_IDS.map(async (eid) => {
    const ep = await getEndpoint(eid);
    if (!ep) return null;
    const history = await getRunHistory(eid, 100);
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
  }))).filter(Boolean) as { label: string; data: { time: string; active: number; inactive: number; total: number }[] }[];

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
}

async function BotCakeSection() {
  const pages = await getLatestPageStates('botcake-platform');
  if (pages.length === 0) return null;
  const overrides = await getBotCakeOverrides();
  const overrideIds = [...overrides.keys()];
  const latestRun = await getLatestRun('botcake-platform');
  const apiHealthy = latestRun && latestRun.heartbeat_ok === 1 && !latestRun.outage_suspected;

  const activeCount = pages.filter(p => p.is_activated === 1).length;
  const inactiveCount = pages.filter(p => p.is_activated !== 1).length;

  const breakdown = [
    { label: 'Active (has orders)', count: pages.filter(p => p.is_activated === 1 && p.activation_reason === 'pancake-activity').length, color: 'text-green-400' },
    { label: 'Active (has conversations)', count: pages.filter(p => p.is_activated === 1 && p.activation_reason === 'has-conversations').length, color: 'text-emerald-400' },
    { label: 'Active (has tools/flows)', count: pages.filter(p => p.is_activated === 1 && p.activation_reason === 'has-tools').length, color: 'text-teal-400' },
    { label: 'Inactive (no activity)', count: pages.filter(p => p.is_activated !== 1 && p.activation_reason === 'no-activity').length, color: 'text-slate-500' },
  ].filter(b => b.count > 0);

  const botCakeHistory = await getRunHistory('botcake-platform', 200);
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
        <a href="/api/botcake-export" className="ml-auto rounded px-2 py-0.5 text-xs font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors">
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
                  }))} overrideIds={overrideIds} />
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
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const endpointId = sp.endpoint_id;

  const endpoint = endpointId ? await getEndpoint(endpointId) : undefined;
  const filteredShopLabel = endpoint?.shop_label ?? null;

  const localRun = await getLatestRun(endpointId);
  const recentRuns = await getRecentRuns(50, endpointId);
  const dbRunCount = await getRunCount(endpointId);
  const totalRunCount = await getRunCount();
  const lastScheduledRunStr = await getSetting('last_scheduled_run');
  const lastScheduledRunMs = lastScheduledRunStr ? parseInt(lastScheduledRunStr, 10) : null;

  const allEndpoints = await listEndpoints();
  const endpoints = allEndpoints.map((ep: { id: string; name: string }) => ({ id: ep.id, name: ep.name }));

  const isFiltered = !!endpointId;
  const isBotCake = endpointId === 'botcake-platform';
  const isPancakeShop = isFiltered && !isBotCake;

  const lastUpdatedDisplay = localRun
    ? new Date(localRun.received_at).toLocaleString()
    : '—';

  const heartbeatFresh = localRun ? localRun.heartbeat_ok === 1 : null;
  const runQuality = localRun?.run_quality ?? null;
  const severity = localRun?.severity ?? null;
  const canaryStatus = localRun?.canary_status ?? null;
  const canaryAlert = localRun?.canary_alert === 1;
  const alertCount = localRun?.alert_count ?? 0;
  const outageSuspected = localRun?.outage_suspected === 1;
  const runId = localRun?.run_id ?? null;
  const ruleVersion = localRun?.rule_version ?? null;
  const inMaintenance = localRun?.in_maintenance_window === 1;

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
          <RunStatusIndicator />
        </div>
        <RunNowButton />
      </div>

      <div className="dashboard-data space-y-6">
        {!isFiltered && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatusCard
                    title="Heartbeat"
                    value={heartbeatFresh === null ? '—' : heartbeatFresh ? 'FRESH' : 'STALE'}
                    tone={heartbeatFresh === true ? 'green' : heartbeatFresh === false ? 'red' : 'gray'}
                    subtitle={<LiveTimeAgo timestampMs={lastScheduledRunMs} />}
                  />
                  <StatusCard
                    title="Run Quality"
                    value={(runQuality ?? 'unknown').toUpperCase()}
                    tone={runQuality === 'full' ? 'green' : runQuality === 'partial' ? 'yellow' : runQuality === 'degraded' ? 'red' : 'gray'}
                    subtitle={`Severity: ${severity ?? '—'}`}
                  />
                  <StatusCard
                    title="Canary"
                    value={(canaryStatus ?? 'unknown').toUpperCase()}
                    tone={canaryStatus === 'ok' ? 'green' : canaryStatus === 'down' ? 'red' : 'gray'}
                    subtitle={canaryAlert ? 'ALERT' : '—'}
                  />
                  <StatusCard
                    title="Alerts"
                    value={String(alertCount)}
                    tone={alertCount > 0 ? 'red' : 'green'}
                    subtitle={outageSuspected ? 'Outage suspected' : 'No outage flagged'}
                  />
                </div>

                {recentRuns.length > 1 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 flex items-center gap-4">
                    <div className="text-xs text-slate-400 uppercase shrink-0">Alert Trend (last {recentRuns.length} runs)</div>
                    <AlertSparkline runs={recentRuns.map(r => ({ alert_count: r.alert_count ?? 0, generated_at: r.generated_at }))} />
                    <div className="text-xs text-slate-500">Red dots = alerts</div>
                  </div>
                )}

                <div className="space-y-8">
                  <PancakeSection />
                  <BotCakeSection />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <dd className="font-mono text-xs">{localRun ? (localRun.endpoint_id === 'botcake-platform' ? 'BotCake API' : 'Pancake / Ingest') : '—'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
          </>
        )}

        {isPancakeShop && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard
                title="Heartbeat"
                value={heartbeatFresh === null ? '—' : heartbeatFresh ? 'FRESH' : 'STALE'}
                tone={heartbeatFresh === true ? 'green' : heartbeatFresh === false ? 'red' : 'gray'}
                subtitle={<LiveTimeAgo timestampMs={lastScheduledRunMs} />}
              />
              <StatusCard
                title="Run Quality"
                value={(runQuality ?? 'unknown').toUpperCase()}
                tone={runQuality === 'full' ? 'green' : runQuality === 'partial' ? 'yellow' : runQuality === 'degraded' ? 'red' : 'gray'}
                subtitle={`Severity: ${severity ?? '—'}`}
              />
              <StatusCard
                title="Canary"
                value={(canaryStatus ?? 'unknown').toUpperCase()}
                tone={canaryStatus === 'ok' ? 'green' : canaryStatus === 'down' ? 'red' : 'gray'}
                subtitle={canaryAlert ? 'ALERT' : '—'}
              />
              <StatusCard
                title="Alerts"
                value={String(alertCount)}
                tone={alertCount > 0 ? 'red' : 'green'}
                subtitle={outageSuspected ? 'Outage suspected' : 'No outage flagged'}
              />
            </div>
            <PancakeSection endpointId={endpointId} />
          </>
        )}

        {isBotCake && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard
                title="Heartbeat"
                value={heartbeatFresh === null ? '—' : heartbeatFresh ? 'FRESH' : 'STALE'}
                tone={heartbeatFresh === true ? 'green' : heartbeatFresh === false ? 'red' : 'gray'}
                subtitle={<LiveTimeAgo timestampMs={lastScheduledRunMs} />}
              />
              <StatusCard
                title="Run Quality"
                value={(runQuality ?? 'unknown').toUpperCase()}
                tone={runQuality === 'full' ? 'green' : runQuality === 'partial' ? 'yellow' : runQuality === 'degraded' ? 'red' : 'gray'}
                subtitle={`Severity: ${severity ?? '—'}`}
              />
              <StatusCard
                title="Canary"
                value={(canaryStatus ?? 'unknown').toUpperCase()}
                tone={canaryStatus === 'ok' ? 'green' : canaryStatus === 'down' ? 'red' : 'gray'}
                subtitle={canaryAlert ? 'ALERT' : '—'}
              />
              <StatusCard
                title="Alerts"
                value={String(alertCount)}
                tone={alertCount > 0 ? 'red' : 'green'}
                subtitle={outageSuspected ? 'Outage suspected' : 'No outage flagged'}
              />
            </div>
            <BotCakeSection />
          </>
        )}
      </div>
    </div>
  );
}
