export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-sm mx-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8">
          <div className="h-6 w-36 mx-auto rounded bg-slate-800 animate-pulse" />
          <div className="mt-6 space-y-4">
            <div className="h-10 rounded bg-slate-800 animate-pulse" />
            <div className="h-10 rounded bg-slate-800 animate-pulse" />
            <div className="h-10 rounded bg-slate-800 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
