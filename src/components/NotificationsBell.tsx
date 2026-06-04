'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type NotificationRow = {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

const severityColors: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

const severityBorders: Record<string, string> = {
  critical: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
};

const severityLabels: Record<string, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

const typeLabels: Record<string, string> = {
  internal_error: 'Internal Error',
  external_error: 'External Error',
  credential_change: 'Credential Change',
  run_error: 'Run Error',
  down_page: 'Down Page',
  csv_export: 'CSV Export',
  token_expiring: 'Token Expiring',
  maintenance: 'Maintenance',
  platform_added: 'Platform Added',
  connector_added: 'Connector Added',
  canary_down: 'Canary Down',
  outage_suspected: 'Outage Suspected',
  alert_triggered: 'Alert Triggered',
  retention_nearing: 'Retention Nearing',
};

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationRow | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelected(null);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleMarkAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function handleDismiss(id: number) {
    await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
    setNotifications(prev => {
      const filtered = prev.filter(n => n.id !== id);
      if (selected && selected.id === id) setSelected(null);
      return filtered;
    });
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function handleMarkRead(id: number) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function openDetail(n: NotificationRow) {
    if (!n.is_read) await handleMarkRead(n.id);
    setSelected(n);
  }

  function closeDetail() {
    setSelected(null);
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatFullDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) setSelected(null); }}
        className="relative p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full min-w-[18px]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-h-[520px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
                <button
                  onClick={closeDetail}
                  className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label="Back"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-sm font-semibold text-slate-200">Notification Detail</h3>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => handleDismiss(selected.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    aria-label="Close"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <h2 className="text-base font-semibold text-slate-100 leading-snug">{selected.title}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                    selected.severity === 'critical' ? 'bg-red-900/60 text-red-300' :
                    selected.severity === 'warning' ? 'bg-amber-900/60 text-amber-300' :
                    'bg-blue-900/60 text-blue-300'
                  }`}>
                    {severityLabels[selected.severity] || selected.severity}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                    {typeLabels[selected.type] || selected.type}
                  </span>
                </div>
                {selected.message && (
                  <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                    {selected.message}
                  </div>
                )}
                <div className="text-xs text-slate-500">
                  {formatFullDate(selected.created_at)}
                </div>
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-slate-400 mb-1">Metadata</h4>
                    <pre className="text-xs text-slate-500 bg-slate-800/50 rounded p-2 overflow-x-auto">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-slate-200">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    aria-label="Close"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">
                    No notifications
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => openDetail(n)}
                      className={`px-4 py-3 border-b border-slate-800 border-l-2 ${severityBorders[n.severity] || 'border-l-slate-600'} ${n.is_read ? 'opacity-60' : ''} hover:bg-slate-800/50 transition-colors group cursor-pointer`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${severityColors[n.severity] || 'bg-slate-500'}`} />
                          <span className="text-xs font-medium text-slate-300 truncate">{n.title}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                          {!n.is_read && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                              className="text-[10px] text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              aria-label="Mark as read"
                            >
                              read
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDismiss(n.id); }}
                            className="text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            aria-label="Dismiss"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {n.message && (
                        <p className="mt-1 text-xs text-slate-400 leading-relaxed line-clamp-2">{n.message}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
