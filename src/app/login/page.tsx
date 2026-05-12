'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-sm mx-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8">
          <h1 className="text-xl font-bold text-slate-100 text-center mb-2">
            Page Monitor
          </h1>
          <p className="text-sm text-slate-400 text-center mb-6">
            Sign in to your dashboard
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs text-slate-400 mb-1">
                Email
              </label>
                <input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                  placeholder="Email"
                  autoFocus
                />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs text-slate-400 mb-1">
                Password
              </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                  placeholder="Password"
                />
            </div>

            {error && (
              <div className="rounded border border-red-800 bg-red-900/20 p-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded px-4 py-2 text-sm font-medium border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}
