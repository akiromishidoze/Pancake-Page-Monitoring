'use client';

// Client-side filter widget for the Page List screen.
// Writes filter state to URL search params so it's bookmarkable and survives refresh.

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';

type Props = {
  shops: string[];
  kinds: string[];
};

export function PageFilters({ shops, kinds }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentShop = searchParams.get('shop') ?? '';
  const currentKind = searchParams.get('kind') ?? '';
  const currentStatus = searchParams.get('status') ?? '';
  const currentCanary = searchParams.get('canary') === '1';
  const currentSearch = searchParams.get('q') ?? '';

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function clearAll() {
    startTransition(() => router.push(pathname));
  }

  const hasFilters =
    currentShop || currentKind || currentStatus || currentCanary || currentSearch;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Shop">
          <select
            value={currentShop}
            onChange={(e) => update('shop', e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-slate-500"
          >
            <option value="">All shops</option>
            {shops.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Activity">
          <select
            value={currentKind}
            onChange={(e) => update('kind', e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-slate-500"
          >
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            value={currentStatus}
            onChange={(e) => update('status', e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-slate-500"
          >
            <option value="">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </Field>

        <Field label="Search">
          <input
            type="text"
            value={currentSearch}
            onChange={(e) => update('q', e.target.value)}
            placeholder="Page name…"
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-slate-500 w-48"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={currentCanary}
            onChange={(e) => update('canary', e.target.checked ? '1' : null)}
            className="rounded border-slate-700 bg-slate-800"
          />
          Canary only
        </label>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="ml-auto text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
          >
            Clear filters
          </button>
        )}

        {pending && (
          <span className="text-xs text-slate-500 ml-2">Updating…</span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </div>
  );
}
