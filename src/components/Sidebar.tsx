'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback } from 'react';

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('sidebar_collapsed') === 'true' : false
  );

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

function NavLink({ href, icon, label, active, collapsed, onNav }: { href: string; icon: string; label: string; active: boolean; collapsed: boolean; onNav: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNav}
      className={`flex items-center rounded-md transition-colors text-sm font-medium ${
        collapsed ? 'justify-center h-9 w-full' : 'px-3 py-2 gap-3'
      } ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
      title={label}
    >
      <SvgIcon d={icon} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function NavGroup({ item, isMobile, collapsed, pagesOpen, onTogglePages, onNav }: { item: NavItem; isMobile?: boolean; collapsed: boolean; pagesOpen: boolean; onTogglePages: () => void; onNav: () => void }) {
  if (isMobile || !collapsed) {
    return (
      <div>
        <button
          onClick={onTogglePages}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
            item.active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
          }`}
        >
          <SvgIcon d={item.icon} />
          <span className="flex-1 text-left">{item.label}</span>
          <SvgIcon d={ICONS.chevron} size={14} className={`transition-transform ${pagesOpen ? 'rotate-90' : ''}`} />
        </button>
        {pagesOpen && item.children && (
          <div className="ml-4 mt-1 space-y-1">
            {item.children.map(child => (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNav}
                className={`block px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  child.active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }
  return <NavLink href={item.href} icon={item.icon} label={item.label} active={item.active} collapsed={collapsed} onNav={onNav} />;
}

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex items-center h-14 border-b border-slate-800 ${compact ? 'justify-center' : 'px-4 gap-3'}`}>
      <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        M
      </div>
      {!compact && (
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-semibold text-white truncate leading-tight">Page Monitor</div>
          <div className="text-xs text-slate-500 truncate leading-tight">Pancake & BotCake</div>
        </div>
      )}
    </div>
  );
}

const ICONS = {
  overview: 'M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zm-11 0h7v7H3z',
  runs: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  pages: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  chevron: 'M9 18l6-6-6-6',
  collapse: 'M15 18l-6-6 6-6',
  settings: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  audit: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6m-6 4h6m-6 4h6m-6 4h4',
};

type NavItem = {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  children?: { href: string; label: string; active: boolean }[];
};

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useCollapsed();
  const [pagesOpen, setPagesOpen] = useState(() => pathname?.startsWith('/pages') ?? false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPagesActive = pathname === '/pages' || pathname?.startsWith('/pages/platform');
  const isBotCakeActive = pathname === '/pages/platform/botcake-platform';
  const isSettingsActive = pathname === '/settings';
  const isAuditActive = pathname === '/audit-log';

  const navItems: NavItem[] = [
    { href: '/', icon: ICONS.overview, label: 'Overview', active: pathname === '/' },
    { href: '/runs', icon: ICONS.runs, label: 'Run History', active: pathname === '/runs' },
    {
      href: '/pages',
      icon: ICONS.pages,
      label: 'Pages',
      active: isPagesActive,
      children: [
        { href: '/pages', label: 'Pancake Platform', active: pathname === '/pages' || (pathname?.startsWith('/pages/platform') && !isBotCakeActive) },
        { href: '/pages/platform/botcake-platform', label: 'BotCake Platform', active: isBotCakeActive },
      ],
    },
    { href: '/audit-log', icon: ICONS.audit, label: 'Audit Log', active: isAuditActive },
    { href: '/settings', icon: ICONS.settings, label: 'Settings', active: isSettingsActive },
  ];

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex border-r border-slate-800 bg-slate-900 flex-shrink-0 flex-col h-full transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
        <Logo compact={collapsed} />

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navItems.slice(0, 2).map(item => (
            <NavLink key={item.href} {...item} collapsed={collapsed} onNav={closeMobile} />
          ))}
          {navItems[2].children && <NavGroup item={navItems[2]} collapsed={collapsed} pagesOpen={pagesOpen} onTogglePages={() => setPagesOpen(prev => !prev)} onNav={closeMobile} />}
        </nav>

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
          <NavLink {...navItems[3]} collapsed={collapsed} onNav={closeMobile} />
          <NavLink {...navItems[4]} collapsed={collapsed} onNav={closeMobile} />
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobile} />
          <aside className="relative w-64 h-full border-r border-slate-800 bg-slate-900 flex-shrink-0 flex flex-col">
            <Logo />
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {navItems.slice(0, 2).map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className={`flex items-center px-3 py-2 gap-3 text-sm font-medium rounded-md transition-colors ${
                    item.active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <SvgIcon d={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
              <NavGroup item={navItems[2]} isMobile collapsed={collapsed} pagesOpen={pagesOpen} onTogglePages={() => setPagesOpen(prev => !prev)} onNav={closeMobile} />
            </nav>
            <div className="border-t border-slate-800 px-3 py-3 space-y-1">
              <Link
                href="/audit-log"
                onClick={closeMobile}
                className={`flex items-center px-3 py-2 gap-3 text-sm font-medium rounded-md transition-colors ${
                  isAuditActive ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                }`}
              >
                <SvgIcon d={ICONS.audit} size={16} />
                <span>Audit Log</span>
              </Link>
              <Link
                href="/settings"
                onClick={closeMobile}
                className={`flex items-center px-3 py-2 gap-3 text-sm font-medium rounded-md transition-colors ${
                  isSettingsActive ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
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
