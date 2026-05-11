'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: 'Overview', href: '/' },
    { name: 'Pages', href: '/pages' },
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
      </div>
    </aside>
  );
}
