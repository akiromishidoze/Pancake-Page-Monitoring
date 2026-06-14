import { listEndpoints, slugify, isPancakeEndpoint, type EndpointRow } from '@/lib/db';
import { getRunCount, getLatestPageStates } from '@/lib/db';
import Link from 'next/link';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import { formatDateWithTz } from '@/lib/format';

export const dynamic = 'force-dynamic';


export default async function PlatformsPage() {
  let endpoints: EndpointRow[] = [];
  const perEndpoint = new Map<string, { total: number; active: number; inactive: number; kinds: Map<string, number> }>();
  try {
    const allEndpoints = await listEndpoints();
    endpoints = allEndpoints.filter(e => e.is_active && isPancakeEndpoint(e));
    const dbCount = await getRunCount();

    const allStates = dbCount > 0 ? await getLatestPageStates() : [];
    for (const s of allStates) {
      const key = s.shop_label || 'Other';
      if (!perEndpoint.has(key)) perEndpoint.set(key, { total: 0, active: 0, inactive: 0, kinds: new Map() });
      const e = perEndpoint.get(key)!;
      e.total++;
      if (s.is_activated) e.active++; else e.inactive++;
      const kind = s.activity_kind || 'none';
      e.kinds.set(kind, (e.kinds.get(kind) ?? 0) + 1);
    }
  } catch (err) {
    console.error('PlatformsPage error:', err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platforms</h2>
        <p className="text-sm text-slate-400 mt-1">
          {endpoints.length} platform{endpoints.length !== 1 ? 's' : ''} configured
        </p>
      </div>

      <SectionErrorBoundary title="Platforms List">
        {endpoints.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400 text-center">
            No platforms configured yet.{' '}
            <Link href="/settings" className="text-blue-400 hover:underline">Add one in Settings</Link>.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {endpoints.map((ep) => {
              const slug = slugify(ep.name);
              return (
                <Link
                  key={ep.id}
                  href={`/pages/platform/${slug}`}
                  className="rounded-lg border border-slate-800 bg-slate-900 p-5 hover:border-slate-600 hover:bg-slate-800/50 transition-all block"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-slate-100">{ep.name}</h3>
                    <span className="text-xs text-slate-500">{ep.url ? new URL(ep.url).hostname : '—'}</span>
                  </div>
                  <div className="flex gap-3 text-sm text-slate-500">
                    <span className="text-green-400 font-medium">{ep.is_active ? 'active' : 'inactive'}</span>
                    {ep.last_used_at && (
                      <span>Last used: {formatDateWithTz(ep.last_used_at)}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SectionErrorBoundary>
    </div>
  );
}
