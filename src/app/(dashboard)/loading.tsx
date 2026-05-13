export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-8 w-48 rounded bg-slate-800" />
          <div className="mt-2 h-4 w-64 rounded bg-slate-800" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <div className="h-4 w-20 rounded bg-slate-800" />
            <div className="mt-3 h-8 w-16 rounded bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="h-5 w-40 rounded bg-slate-800" />
        <div className="mt-4 h-48 rounded bg-slate-800" />
      </div>
    </div>
  );
}
