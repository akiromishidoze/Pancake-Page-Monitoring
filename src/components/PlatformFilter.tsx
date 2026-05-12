'use client';

import { useRouter } from 'next/navigation';

export function PlatformFilter({ endpoints, selected }: { endpoints: { id: string; name: string }[]; selected?: string }) {
  const router = useRouter();

  return (
    <select
      className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
      defaultValue={selected || ''}
      onChange={(e) => {
        const val = e.target.value;
        router.push(val ? `/runs?endpoint_id=${encodeURIComponent(val)}` : '/runs');
      }}
    >
      <option value="">All platforms</option>
      {endpoints.map((ep) => (
        <option key={ep.id} value={ep.id}>{ep.name}</option>
      ))}
    </select>
  );
}
