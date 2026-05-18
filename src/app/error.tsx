'use client';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border border-red-800 bg-slate-900 p-8 text-center">
        <h1 className="text-2xl font-bold text-red-400">Error</h1>
        <p className="mt-3 text-sm text-slate-400">{error.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={reset}
          className="mt-6 rounded px-4 py-2 text-sm font-medium border border-red-700 bg-red-900/30 text-red-300 hover:bg-red-800/40 transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
