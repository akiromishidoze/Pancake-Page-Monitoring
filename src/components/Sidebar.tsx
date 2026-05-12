'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const prefs: Record<string, boolean> = {};
    if (pathname?.startsWith('/pages')) prefs.pages = true;
    return prefs;
  });

  const isPagesActive = pathname === '/pages' || pathname?.startsWith('/pages/pancake');

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900 flex-shrink-0 flex flex-col h-full">
      <div className="p-6 flex-1 flex flex-col">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Navigation
        </h2>
        <nav className="mt-4 space-y-1">
          <Link
            href="/"
            className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              pathname === '/'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            Overview
          </Link>

          {/* Pages — expandable */}
          <div>
            <button
              onClick={() => toggle('pages')}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                isPagesActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
              }`}
            >
              <span>Pages</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${expanded.pages ? 'rotate-90' : ''}`}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            {expanded.pages && (
              <div className="ml-4 mt-1 space-y-1">
                <Link
                  href="/pages/pancake"
                  className={`block px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    pathname?.startsWith('/pages/pancake')
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  Pancake Platform
                </Link>
              </div>
            )}
          </div>
        </nav>
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
