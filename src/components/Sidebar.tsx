'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

function SvgIcon({ d, size = 20, className = '' }: { d: string; size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 ${className}`}>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  overview: 'M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zm-11 0h7v7H3z',
  runs: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  pages: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  chevron: 'M9 18l6-6-6-6',
  collapse: 'M15 18l-6-6 6-6',
  settings: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
};

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useCollapsed();
  const [pagesOpen, setPagesOpen] = useState(() => pathname?.startsWith('/pages') ?? false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPagesActive = pathname === '/pages' || pathname?.startsWith('/pages/platform');
  const isBotCakeActive = pathname === '/pages/platform/botcake-platform';

  function closeMobile() {
    setMobileOpen(false);
  }

  function NavLink({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
    return (
      <Link
        href={href}
        onClick={closeMobile}
        className={`flex items-center rounded-md transition-colors text-sm font-medium ${
          collapsed
            ? 'justify-center h-9 w-full'
            : 'px-3 py-2 gap-3'
        } ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
        title={label}
      >
        <SvgIcon d={icon} />
        {!collapsed && <span>{label}</span>}
      </Link>
    );
  }

  return (
    <>
      {/* Desktop */}
      <aside className={`hidden lg:flex border-r border-slate-800 bg-slate-900 flex-shrink-0 flex-col h-full transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
        {/* Logo */}
        <div className={`flex items-center h-14 border-b border-slate-800 ${collapsed ? 'justify-center' : 'px-4 gap-3'}`}>
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            M
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <div className="text-sm font-semibold text-white truncate leading-tight">Page Monitor</div>
              <div className="text-xs text-slate-500 truncate leading-tight">Pancake & BotCake</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          <NavLink href="/" icon={ICONS.overview} label="Overview" active={pathname === '/'} />
          <NavLink href="/runs" icon={ICONS.runs} label="Run History" active={pathname === '/runs'} />

          {collapsed ? (
            <NavLink href="/pages" icon={ICONS.pages} label="Pages" active={isPagesActive} />
          ) : (
            <div>
              <button
                onClick={() => setPagesOpen(prev => !prev)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                  isPagesActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <SvgIcon d={ICONS.pages} />
                <span className="flex-1 text-left">Pages</span>
                <SvgIcon d={ICONS.chevron} size={14} className={`transition-transform ${pagesOpen ? 'rotate-90' : ''}`} />
              </button>
              {pagesOpen && (
                <div className="ml-4 mt-1 space-y-1">
                  <Link
                    href="/pages"
                    onClick={closeMobile}
                    className={`block px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      pathname === '/pages' || (pathname?.startsWith('/pages/platform') && !isBotCakeActive)
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    Pancake Platform
                  </Link>
                  <Link
                    href="/pages/platform/botcake-platform"
                    onClick={closeMobile}
                    className={`block px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      isBotCakeActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    BotCake Platform
                  </Link>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Bottom */}
        <div className="border-t border-slate-800 px-3 py-3 space-y-1">
          <div className={`flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
            <button
              onClick={toggle}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <SvgIcon d={ICONS.collapse} size={16} />
            </button>
          </div>
          <Link
            href="/settings"
            onClick={closeMobile}
            className={`flex items-center rounded-md transition-colors text-sm font-medium ${
              collapsed ? 'justify-center h-9 w-full' : 'px-3 py-2 gap-3'
            } ${pathname === '/settings' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'}`}
            title="Settings"
          >
            <SvgIcon d={ICONS.settings} size={16} />
            {!collapsed && <span>Settings</span>}
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobile} />
          <aside className="relative w-64 h-full border-r border-slate-800 bg-slate-900 flex-shrink-0 flex flex-col">
            {/* Logo */}
            <div className="flex items-center h-14 px-4 gap-3 border-b border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                M
              </div>
              <div className="flex flex-col min-w-0">
                <div className="text-sm font-semibold text-white truncate leading-tight">Page Monitor</div>
                <div className="text-xs text-slate-500 truncate leading-tight">Pancake & BotCake</div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              <Link
                href="/"
                onClick={closeMobile}
                className={`flex items-center px-3 py-2 gap-3 text-sm font-medium rounded-md transition-colors ${
                  pathname === '/' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <SvgIcon d={ICONS.overview} />
                <span>Overview</span>
              </Link>
              <Link
                href="/runs"
                onClick={closeMobile}
                className={`flex items-center px-3 py-2 gap-3 text-sm font-medium rounded-md transition-colors ${
                  pathname === '/runs' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <SvgIcon d={ICONS.runs} />
                <span>Run History</span>
              </Link>
              <div>
                <button
                  onClick={() => setPagesOpen(prev => !prev)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    isPagesActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <SvgIcon d={ICONS.pages} />
                  <span className="flex-1 text-left">Pages</span>
                <SvgIcon d={ICONS.chevron} size={14} className={`transition-transform ${pagesOpen ? 'rotate-90' : ''}`} />
                </button>
                {pagesOpen && (
                  <div className="ml-4 mt-1 space-y-1">
                    <Link
                      href="/pages"
                      onClick={closeMobile}
                      className={`block px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        pathname === '/pages' || (pathname?.startsWith('/pages/platform') && !isBotCakeActive)
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                      }`}
                    >
                      Pancake Platform
                    </Link>
                    <Link
                      href="/pages/platform/botcake-platform"
                      onClick={closeMobile}
                      className={`block px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        isBotCakeActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                      }`}
                    >
                      BotCake Platform
                    </Link>
                  </div>
                )}
              </div>
            </nav>

            {/* Settings */}
            <div className="border-t border-slate-800 px-3 py-3">
              <Link
                href="/settings"
                onClick={closeMobile}
                className={`flex items-center px-3 py-2 gap-3 text-sm font-medium rounded-md transition-colors ${
                  pathname === '/settings' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                }`}
              >
                <SvgIcon d={ICONS.settings} size={16} />
                <span>Settings</span>
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-40 w-12 h-12 rounded-full bg-blue-900/80 border border-blue-700 text-blue-300 flex items-center justify-center shadow-lg hover:bg-blue-800 transition-colors cursor-pointer"
        title="Open navigation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </>
  );
}
