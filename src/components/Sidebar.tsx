'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shopParam = searchParams?.get('shop') ?? '';

  const links = [
    { name: 'Overview', href: '/' },
    { name: 'Pages', href: '/pages' },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900 flex-shrink-0 flex flex-col h-full">
      <div className="p-6 flex-1 flex flex-col">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Navigation
        </h2>
        <nav className="mt-4 space-y-1">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Shop tabs shown when Pages is active */}
        {pathname?.startsWith('/pages') && (
          <div className="mt-6 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              Shops
            </h3>
            <div className="mt-2 flex flex-col gap-2 px-1">
              {['All Shops', 'Shop 1', 'Shop 2', 'Shop 3'].map((t) => {
                const isActive = (t === 'All Shops' && !shopParam) || shopParam === t;
                const href = t === 'All Shops' ? '/pages' : `/pages?shop=${encodeURIComponent(t)}`;
                return (
                  <Link
                    key={t}
                    href={href}
                    className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    {t}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 p-4">
        <Link
          href="/settings"
          className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            pathname === '/settings'
              ? 'bg-slate-800 text-white'
              : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
          }`}
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span className="text-xs">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
