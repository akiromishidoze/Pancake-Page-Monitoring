import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-6xl font-bold text-slate-600">404</h1>
        <p className="mt-4 text-sm text-slate-400">Page not found</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded px-4 py-2 text-sm font-medium border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
