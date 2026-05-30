export default function RunsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-slate-800" />
      <div className="h-4 w-32 rounded bg-slate-800/50" />
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 rounded bg-slate-800" />
        <div className="h-8 w-24 rounded bg-slate-800" />
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="flex gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-3 w-16 rounded bg-slate-800" />
            ))}
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-4 border-b border-slate-800/50 flex gap-8">
            {Array.from({ length: 8 }).map((_, j) => (
              <div key={j} className={`h-3 rounded bg-slate-800/50 ${j === 0 ? 'w-36' : j === 1 ? 'w-20' : 'w-16'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
