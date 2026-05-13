'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-700 bg-red-900/20 p-6">
      <h2 className="text-xl font-bold text-red-400">Something went wrong</h2>
      <p className="mt-2 text-red-200 text-sm">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 rounded px-4 py-2 text-sm font-medium border border-red-700 bg-red-900/30 text-red-300 hover:bg-red-800/40 transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
