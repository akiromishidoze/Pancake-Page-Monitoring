'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
    >
      Logout
    </button>
  );
}
