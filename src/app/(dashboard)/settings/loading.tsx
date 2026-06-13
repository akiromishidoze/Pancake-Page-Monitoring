export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-slate-800" />
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="h-5 w-32 rounded bg-slate-800" />
        <div className="mt-4 space-y-4">
          <div className="h-10 w-full rounded bg-slate-800/50" />
          <div className="h-10 w-full rounded bg-slate-800/50" />
          <div className="h-10 w-32 rounded bg-slate-800" />
        </div>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="h-5 w-40 rounded bg-slate-800" />
        <div className="mt-4 space-y-4">
          <div className="h-10 w-full rounded bg-slate-800/50" />
          <div className="h-10 w-full rounded bg-slate-800/50" />
          <div className="h-10 w-full rounded bg-slate-800/50" />
          <div className="h-10 w-32 rounded bg-slate-800" />
        </div>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="h-5 w-44 rounded bg-slate-800" />
        <div className="mt-4 h-24 w-full rounded bg-slate-800/50" />
      </div>
    </div>
  );
}
