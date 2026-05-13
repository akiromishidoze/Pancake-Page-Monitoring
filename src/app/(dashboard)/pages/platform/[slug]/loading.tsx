export default function PlatformLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-24 rounded bg-slate-800" />
      <div className="h-8 w-56 rounded bg-slate-800" />
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="bg-slate-800/50 px-4 py-3">
          <div className="h-4 w-32 rounded bg-slate-700" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-t border-slate-800 px-4 py-3">
            <div className="h-4 w-48 rounded bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
