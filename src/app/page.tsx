import { fetchReceiverStatus } from '@/lib/receiver';
import { getLatestRun, getRunCount, getSetting, listEndpoints, getEndpoint } from '@/lib/db';
import { StatusCard } from '@/components/StatusCard';
import { RunNowButton } from '@/components/RunNowButton';
import { RunStatusIndicator } from '@/components/RunStatusIndicator';
import { LiveTimeAgo } from '@/components/LiveTimeAgo';
import { ActiveDonutChart } from '@/components/ActiveDonutChart';
import { PageWaterfallChart } from '@/components/PageWaterfallChart';
import { BackfillButton } from '@/components/BackfillButton';
import { EndpointFilter } from '@/components/EndpointFilter';

type SearchParams = {
  endpoint_id?: string;
};

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const endpointId = sp.endpoint_id;

  const result = await fetchReceiverStatus();

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-700 bg-red-900/20 p-6">
        <h2 className="text-xl font-bold text-red-400">Receiver unreachable</h2>
        <p className="mt-2 text-red-200">Error: {result.error}</p>
        <p className="mt-2 text-sm text-slate-400">
          Check that RECEIVER_URL and MONITOR_SECRET are set in .env.local, and
          that the receiver workflow is active.
        </p>
      </div>
    );
  }

  const { data } = result;
  const h = data.latest_health;
  const heartbeatFresh = data.status === 'fresh';

  const endpoint = endpointId ? getEndpoint(endpointId) : undefined;
  const filteredShopLabel = endpoint?.shop_label ?? null;

  let activePages = data.active_pages ?? [];
  let inactivePages = data.inactive_pages ?? [];
  if (filteredShopLabel) {
    activePages = activePages.filter((p: any) => (p.shop_label ?? p.shop) === filteredShopLabel);
    inactivePages = inactivePages.filter((p: any) => (p.shop_label ?? p.shop) === filteredShopLabel);
  }

  const localRun = getLatestRun(endpointId);
  const dbRunCount = getRunCount(endpointId);
  const totalRunCount = getRunCount();
  const lastScheduledRunStr = getSetting('last_scheduled_run');
  const lastScheduledRunMs = lastScheduledRunStr ? parseInt(lastScheduledRunStr, 10) : null;

  const lastUpdatedDisplay = localRun
    ? new Date(localRun.received_at).toLocaleString()
    : new Date(data.generated_at).toLocaleString();

  const endpoints = listEndpoints().map((ep) => ({ id: ep.id, name: ep.name }));

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatusCard
            title="Heartbeat"
            value={heartbeatFresh ? 'FRESH' : 'STALE'}
            tone={heartbeatFresh ? 'green' : 'red'}
            subtitle={<LiveTimeAgo timestampMs={lastScheduledRunMs} />}
          />
          <StatusCard
            title="Run Quality"
            value={(h?.run_quality ?? 'unknown').toUpperCase()}
            tone={
              h?.run_quality === 'full'
                ? 'green'
                : h?.run_quality === 'partial'
                  ? 'yellow'
                  : h?.run_quality === 'degraded'
                    ? 'red'
                    : 'gray'
            }
            subtitle={`Severity: ${h?.severity ?? '—'}`}
          />
          <StatusCard
            title="Canary"
            value={(h?.canary_status ?? 'unknown').toUpperCase()}
            tone={
              h?.canary_status === 'ok'
                ? 'green'
                : h?.canary_status === 'down'
                  ? 'red'
                  : 'gray'
            }
            subtitle={h?.canary_alert ? 'ALERT' : '—'}
          />
          <StatusCard
            title="Alerts"
            value={String(h?.alert_count ?? 0)}
            tone={(h?.alert_count ?? 0) > 0 ? 'red' : 'green'}
            subtitle={h?.outage_suspected ? 'Outage suspected' : 'No outage flagged'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <ActiveDonutChart
              activeCount={activePages.length}
              inactiveCount={inactivePages.length}
            />
          </div>
          <div className="lg:col-span-2">
            <PageWaterfallChart
              activePages={activePages}
              inactivePages={inactivePages}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-medium text-slate-400 uppercase">
            Receiver
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Total runs received</dt>
              <dd className="font-mono">{data.runs_received_total}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Receiver sd size</dt>
              <dd className="font-mono">
                {data.receiver_sd_size_bytes
                  ? `${(data.receiver_sd_size_bytes / 1024).toFixed(1)} KB`
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Last backup at</dt>
              <dd className="font-mono">
                {data.last_backup_at
                  ? new Date(data.last_backup_at).toLocaleString()
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Backup rejected</dt>
              <dd className="font-mono">
                {data.last_backup_rejected ? 'YES' : 'no'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">DB runs (filtered)</dt>
              <dd className="font-mono">{dbRunCount}</dd>
            </div>
          </dl>
          {totalRunCount < 5 && (
            <BackfillButton />
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-medium text-slate-400 uppercase">
            Run details
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Run ID</dt>
              <dd className="font-mono text-xs">{h?.run_id ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Rule version</dt>
              <dd className="font-mono">v{h?.rule_version ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">In maintenance</dt>
              <dd className="font-mono">
                {h?.in_maintenance_window ? 'YES' : 'no'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">e2e mismatches</dt>
              <dd className="font-mono">
                {h?.e2e_pancake_active_botcake_inactive ?? 0}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Fetch errors (orders)</dt>
              <dd className="font-mono">{h?.fetch_errors_orders ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Fetch errors (customers)</dt>
              <dd className="font-mono">{h?.fetch_errors_customers ?? 0}</dd>
            </div>
          </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
