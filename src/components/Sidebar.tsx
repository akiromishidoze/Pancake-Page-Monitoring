'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback } from 'react';

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      {children}
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useCollapsed();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const prefs: Record<string, boolean> = {};
    if (pathname?.startsWith('/pages')) prefs.pages = true;
    return prefs;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPagesActive = pathname === '/pages' || pathname?.startsWith('/pages/platform');
  const isBotCakeActive = pathname === '/pages/platform/botcake-platform';

  function toggleGroup(key: string) {
    if (collapsed) return;
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
      active
        ? 'bg-slate-800 text-white'
        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 flex-1 flex flex-col overflow-hidden">
        <div className={`flex items-center gap-2 mb-4 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            M
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-white truncate">Page Monitor</span>
              <span className="text-xs text-slate-500 truncate">Pancake & BotCake</span>
            </div>
          )}
        </div>

        <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : ''}`}>
          <button
            onClick={toggle}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        {!collapsed && (
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Navigation
          </h2>
        )}

        <nav className="space-y-1">
          <Link
            href="/"
            onClick={closeMobile}
            className={linkClass(pathname === '/')}
            title="Overview"
          >
            <NavIcon path="/">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </NavIcon>
            {!collapsed && <span>Overview</span>}
          </Link>

          <Link
            href="/runs"
            onClick={closeMobile}
            className={linkClass(pathname === '/runs')}
            title="Run History"
          >
            <NavIcon path="/runs">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </NavIcon>
            {!collapsed && <span>Run History</span>}
          </Link>

          <div>
            {collapsed ? (
              <Link
                href="/pages"
                onClick={closeMobile}
                className={linkClass(isPagesActive)}
                title="Pages"
              >
                <NavIcon path="/pages">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </NavIcon>
              </Link>
            ) : (
              <>
                <button
                  onClick={() => toggleGroup('pages')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    isPagesActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <NavIcon path="/pages">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </NavIcon>
                    <span>Pages</span>
                  </div>
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
                    className={`transition-transform flex-shrink-0 ${expanded.pages ? 'rotate-90' : ''}`}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                {expanded.pages && (
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
                        isBotCakeActive
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                      }`}
                    >
                      BotCake Platform
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </nav>
      </div>

      <div className={`border-t border-slate-800 p-4 ${collapsed ? 'flex justify-center' : ''}`}>
        <Link
          href="/settings"
          onClick={closeMobile}
          className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            collapsed ? 'w-10 h-10' : ''
          } ${
            pathname === '/settings'
              ? 'bg-slate-800 text-white'
              : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
          }`}
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          {!collapsed && <span className="text-xs">Settings</span>}
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex border-r border-slate-800 bg-slate-900 flex-shrink-0 flex-col h-full transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
        {sidebarContent}
      </aside>

      {/* Mobile overlay — always full width */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobile} />
          <aside className="relative w-64 h-full border-r border-slate-800 bg-slate-900 flex-shrink-0 flex flex-col">
            {sidebarContent}
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
