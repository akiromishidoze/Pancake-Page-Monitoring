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
    { name: 'Settings', href: '/settings' },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900 flex-shrink-0 flex flex-col h-full">
      <div className="p-6">
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
    </aside>
  );
}
