'use client';

import { useRouter } from 'next/navigation';

export function Pagination({ page, totalPages, endpointId }: { page: number; totalPages: number; endpointId?: string | null }) {
  const router = useRouter();

  function goTo(p: number) {
    const params = new URLSearchParams();
    if (endpointId) params.set('endpoint_id', endpointId);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    router.push(qs ? `/runs?${qs}` : '/runs');
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {page > 1 && (
        <button
          onClick={() => goTo(page - 1)}
          className="px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Previous
        </button>
      )}
      <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
      {page < totalPages && (
        <button
          onClick={() => goTo(page + 1)}
          className="px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Next
        </button>
      )}
    </div>
  );
}
