import { listEndpoints, slugify } from '@/lib/db';
import { getRunCount, getLatestPageStates } from '@/lib/db';
import Link from 'next/link';

const KIND_TONE: Record<string, string> = {
  funnel_converting: 'bg-green-900/30 text-green-300 border-green-800',
  direct_orders_only: 'bg-emerald-900/30 text-emerald-300 border-emerald-800',
  chat_only: 'bg-yellow-900/30 text-yellow-300 border-yellow-800',
  none: 'bg-slate-800/50 text-slate-400 border-slate-700',
};

export default async function PlatformsPage() {
  const allEndpoints = await listEndpoints();
  const endpoints = allEndpoints.filter((e: { is_active: number; url?: string | null }) => e.is_active && !e.url?.includes('botcake.io'));
  const dbCount = await getRunCount();

  // Compute per-platform page stats from monitoring data
  const allStates = dbCount > 0 ? await getLatestPageStates() : [];
  const perEndpoint = new Map<string, { total: number; active: number; inactive: number; kinds: Map<string, number> }>();
  for (const s of allStates) {
    const key = s.shop_label || 'Other';
    if (!perEndpoint.has(key)) perEndpoint.set(key, { total: 0, active: 0, inactive: 0, kinds: new Map() });
    const e = perEndpoint.get(key)!;
    e.total++;
    if (s.is_activated) e.active++; else e.inactive++;
    const kind = s.activity_kind || 'none';
    e.kinds.set(kind, (e.kinds.get(kind) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platforms</h2>
        <p className="text-sm text-slate-400 mt-1">
          {endpoints.length} platform{endpoints.length !== 1 ? 's' : ''} configured
        </p>
      </div>

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
                    <span>Last used: {new Date(ep.last_used_at).toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
