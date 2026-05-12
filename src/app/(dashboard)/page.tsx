import { getLatestRun, getRunCount, getSetting, listEndpoints, getEndpoint, getLatestPageStates } from '@/lib/db';
import { StatusCard } from '@/components/StatusCard';
import { RunNowButton } from '@/components/RunNowButton';
import { RunStatusIndicator } from '@/components/RunStatusIndicator';
import { LiveTimeAgo } from '@/components/LiveTimeAgo';
import { ActiveDonutChart } from '@/components/ActiveDonutChart';
import { PageWaterfallChart } from '@/components/PageWaterfallChart';
import { EndpointFilter } from '@/components/EndpointFilter';

type SearchParams = {
  endpoint_id?: string;
};

async function PancakeSection({ endpointId }: { endpointId?: string }) {
  const pages = getLatestPageStates(endpointId);
  const activePages = pages.filter((p) => p.is_activated);
  const inactivePages = pages.filter((p) => !p.is_activated);

  if (pages.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Pancake Platform</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <ActiveDonutChart activeCount={activePages.length} inactiveCount={inactivePages.length} />
        </div>
        <div className="lg:col-span-2">
          <PageWaterfallChart activePages={activePages} inactivePages={inactivePages} />
        </div>
      </div>
    </div>
  );
}

async function BotCakeSection() {
  const pages = getLatestPageStates('botcake-platform');
  if (pages.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">BotCake Platform</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <ActiveDonutChart activeCount={pages.length} inactiveCount={0} />
        </div>
        <div className="lg:col-span-2">
          <PageWaterfallChart
            activePages={pages.map((p) => ({ page_id: p.page_id, name: p.page_name ?? p.page_id, kind: null, is_activated: true }))}
            inactivePages={[]}
          />
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
          <BotCakeSection />
        )}
      </div>
    </div>
  );
}
