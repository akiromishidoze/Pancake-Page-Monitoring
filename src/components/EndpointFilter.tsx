'use client';

import { useRouter, useSearchParams } from 'next/navigation';

type Endpoint = {
  id: string;
  name: string;
};

export function EndpointFilter({ endpoints }: { endpoints: Endpoint[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams?.get('endpoint_id') ?? '';

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (val) {
      params.set('endpoint_id', val);
    } else {
      params.delete('endpoint_id');
    }
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
  }

  return (
    <select
      value={current}
      onChange={onChange}
      className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
    >
      <option value="">All Endpoints</option>
      {endpoints.map((ep) => (
        <option key={ep.id} value={ep.id}>
          {ep.name}
        </option>
      ))}
    </select>
  );
}
