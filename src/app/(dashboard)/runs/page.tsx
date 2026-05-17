import { pool, listEndpoints, type RunRow } from '@/lib/db';
import { PlatformFilter } from '@/components/PlatformFilter';
import { Pagination } from '@/components/Pagination';

export const dynamic = 'force-dynamic';

type SearchParams = {
  endpoint_id?: string;
  page?: string;
};

const PAGE_SIZE = 50;

function tone(status: string | null): string {
  if (status === 'full') return 'bg-green-900/40 text-green-300 border-green-800';
  if (status === 'partial') return 'bg-yellow-900/30 text-yellow-300 border-yellow-800';
  if (status === 'degraded') return 'bg-red-900/30 text-red-300 border-red-800';
  return 'bg-slate-800/50 text-slate-400 border-slate-700';
}

function canaryTone(status: string | null): string {
  if (status === 'ok') return 'text-green-400';
  if (status === 'down') return 'text-red-400';
  return 'text-slate-500';
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const endpointId = sp.endpoint_id || null;
  const page = Math.max(1, parseInt(sp.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const [allEndpoints, runsResult] = await Promise.all([
    listEndpoints(),
    Promise.resolve().then(async () => {
      if (endpointId) {
        const [r, c] = await Promise.all([
          pool.query('SELECT * FROM runs WHERE endpoint_id = $1 ORDER BY generated_at DESC LIMIT $2 OFFSET $3', [endpointId, PAGE_SIZE, offset]),
          pool.query('SELECT COUNT(*) as c FROM runs WHERE endpoint_id = $1', [endpointId]),
        ]);
        return { rows: r.rows as RunRow[], total: parseInt(c.rows[0].c, 10) };
      } else {
        const [r, c] = await Promise.all([
          pool.query('SELECT * FROM runs ORDER BY generated_at DESC LIMIT $1 OFFSET $2', [PAGE_SIZE, offset]),
          pool.query('SELECT COUNT(*) as c FROM runs'),
        ]);
        return { rows: r.rows as RunRow[], total: parseInt(c.rows[0].c, 10) };
      }
    }),
  ]);
  const endpoints = allEndpoints;
  const { rows, total } = runsResult;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Run History</h2>
          <p className="text-sm text-slate-400 mt-1">
            {total} total run{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400">Filter by platform:</label>
          <PlatformFilter endpoints={endpoints.map(e => ({ id: e.id, name: e.name }))} selected={endpointId || undefined} />
        </div>
        <a
          href={`/api/export?format=csv${endpointId ? `&endpoint_id=${encodeURIComponent(endpointId)}` : ''}`}
          className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
        >
          Export CSV
        </a>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400 text-center">
          No runs found.
        </div>
      ) : (
        <div className="dashboard-data rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3 font-medium">Run ID</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Generated</th>
                <th className="px-4 py-3 font-medium">Quality</th>
                <th className="px-4 py-3 font-medium">Canary</th>
                <th className="px-4 py-3 font-medium">Alerts</th>
                <th className="px-4 py-3 font-medium">Heartbeat</th>
                <th className="px-4 py-3 font-medium">Pages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r: RunRow) => (
                <tr key={r.run_id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300" title={r.run_id}>
                    {r.run_id.length > 24 ? r.run_id.slice(0, 24) + '…' : r.run_id}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {r.endpoint_id === 'botcake-platform' ? 'BotCake' : r.endpoint_id || 'Legacy'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(r.generated_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono border ${tone(r.run_quality)}`}>
                      {r.run_quality || '—'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono ${canaryTone(r.canary_status)}`}>
                    {r.canary_status || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs ${(r.alert_count || 0) > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {r.alert_count ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${r.heartbeat_ok ? 'bg-green-500' : 'bg-red-500'}`} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {r.total_pages ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} endpointId={endpointId} />
      )}
    </div>
  );
}
