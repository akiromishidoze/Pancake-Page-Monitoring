export default function PlatformsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-slate-800" />
      <div className="h-4 w-32 rounded bg-slate-800/50" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <div className="h-5 w-32 rounded bg-slate-800" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div>
                <div className="h-3 w-12 rounded bg-slate-800/50" />
                <div className="mt-1 h-6 w-8 rounded bg-slate-800" />
              </div>
              <div>
                <div className="h-3 w-12 rounded bg-slate-800/50" />
                <div className="mt-1 h-6 w-8 rounded bg-slate-800" />
              </div>
              <div>
                <div className="h-3 w-12 rounded bg-slate-800/50" />
                <div className="mt-1 h-6 w-8 rounded bg-slate-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
