import Link from 'next/link';
import { getLatestRun, getRunCount, getSetting, listEndpoints, getEndpoint, getLatestPageStates, getRecentRuns, type PageStateRow } from '@/lib/db';
import { StatusCard } from '@/components/StatusCard';
import { RunNowButton } from '@/components/RunNowButton';
import { RunStatusIndicator } from '@/components/RunStatusIndicator';
import { LiveTimeAgo } from '@/components/LiveTimeAgo';
import { ActiveDonutChart } from '@/components/ActiveDonutChart';
import { PageWaterfallChart } from '@/components/PageWaterfallChart';
import { EndpointFilter } from '@/components/EndpointFilter';
import { AlertSparkline } from '@/components/AlertSparkline';

type SearchParams = {
  endpoint_id?: string;
};

const PANCAKE_ENDPOINT_IDS = ['430202960', '1635192689', '1942241731'];

async function PancakeSection({ endpointId }: { endpointId?: string }) {
  let allPages: PageStateRow[] = [];
  if (endpointId) {
    allPages = getLatestPageStates(endpointId);
  } else {
    for (const eid of PANCAKE_ENDPOINT_IDS) {
      allPages.push(...getLatestPageStates(eid));
    }
  }

  if (allPages.length === 0) return null;

  const activePages = allPages.filter((p) => p.is_activated);
  const inactivePages = allPages.filter((p) => !p.is_activated);
  const activeCount = activePages.length;
  const inactiveCount = inactivePages.length;

  const shopBreakdown = PANCAKE_ENDPOINT_IDS.map((eid) => {
    const ep = getEndpoint(eid);
    if (!ep) return null;
    const shopPages = allPages.filter((p) => p.shop_label === ep.shop_label);
    const shopActive = shopPages.filter((p) => p.is_activated).length;
    const shopInactive = shopPages.length - shopActive;
    return { label: ep.shop_label ?? ep.name, total: shopPages.length, active: shopActive, inactive: shopInactive };
  }).filter(Boolean);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Pancake Platform</h3>
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
                    <tr key={s!.label} className="text-slate-300">
                      <td className="py-2 pr-4">{s!.label}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{s!.total}</td>
                      <td className="py-2 pr-4 text-green-400 font-mono text-xs">{s!.active}</td>
                      <td className="py-2 text-red-400 font-mono text-xs">{s!.inactive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function BotCakeSection() {
  const pages = getLatestPageStates('botcake-platform');
  if (pages.length === 0) return null;

  const uniquePages = new Set(pages.map(p => p.page_id)).size;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">BotCake Platform</h3>
      <p className="text-xs text-slate-400 mb-4">
        {uniquePages} page{uniquePages !== 1 ? 's' : ''} monitored via BotCake API.
        BotCake does not expose activity kind or status data — all pages shown as active.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <ActiveDonutChart activeCount={pages.length} inactiveCount={0} />
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 h-[400px] flex flex-col">
            <div className="flex items-baseline gap-2 mb-3 shrink-0">
              <span className="text-2xl font-bold text-slate-200">{uniquePages}</span>
              <span className="text-sm text-slate-400">page{uniquePages !== 1 ? 's' : ''} active</span>
            </div>
            <div className="flex-1 overflow-auto rounded-lg border border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-800 z-10">
                  <tr className="text-left text-xs uppercase text-slate-400">
                    <th className="px-4 py-3 font-medium">Page</th>
                    <th className="px-4 py-3 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {pages.map(p => (
                    <tr key={p.page_id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-100">
                        <Link href={`/pages/${p.page_id}`} className="hover:underline">{p.page_name ?? p.page_id}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{p.page_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
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

  const endpoint = endpointId ? getEndpoint(endpointId) : undefined;
  const filteredShopLabel = endpoint?.shop_label ?? null;

  const localRun = getLatestRun(endpointId);
  const recentRuns = getRecentRuns(50, endpointId);
  const dbRunCount = getRunCount(endpointId);
  const totalRunCount = getRunCount();
  const lastScheduledRunStr = getSetting('last_scheduled_run');
  const lastScheduledRunMs = lastScheduledRunStr ? parseInt(lastScheduledRunStr, 10) : null;

  const endpoints = listEndpoints().map((ep) => ({ id: ep.id, name: ep.name }));

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
