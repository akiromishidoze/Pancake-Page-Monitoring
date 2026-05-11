'use client';

// "Run Now" button — POSTs to /api/run, shows feedback, refreshes the page on success.
// Also includes a split-button dropdown to configure the scheduled background trigger.

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Status =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'success'; message: string; triggeredAt: string }
  | { phase: 'error'; error: string };

const SCHEDULE_OPTIONS = [
  { value: 'off', label: 'Schedule: Off' },
  { value: '300000', label: 'Every 5 minutes' },
  { value: '600000', label: 'Every 10 minutes' },
  { value: '900000', label: 'Every 15 minutes' },
  { value: '1800000', label: 'Every 30 minutes' },
  { value: '3600000', label: 'Every 1 hour' },
  { value: '14400000', label: 'Every 4 hours' },
];

export function RunNowButton() {
  const [status, setStatus] = useState<Status>({ phase: 'idle' });
  const [schedule, setSchedule] = useState<string>('off');
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetch('/api/schedule')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setSchedule(data.interval);
        }
      })
      .catch(console.error);
  }, []);

  async function handleScheduleChange(newInterval: string) {
    setSchedule(newInterval);
    setIsUpdatingSchedule(true);
    setIsDropdownOpen(false);
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: newInterval }),
      });
    } catch (err) {
      console.error('Failed to update schedule', err);
    } finally {
      setIsUpdatingSchedule(false);
    }
  }

  async function handleClick() {
    setStatus({ phase: 'running' });
    window.dispatchEvent(new Event('run-started')); // Instantly trigger the UI loading sequence globally
    
    try {
      const res = await fetch('/api/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ phase: 'error', error: data.error || `HTTP ${res.status}` });
        return;
      }
      setStatus({
        phase: 'success',
        message: data.message || 'Run triggered',
        triggeredAt: data.triggered_at || new Date().toISOString(),
      });
      setTimeout(() => {
        startTransition(() => router.refresh());
      }, 75_000);
    } catch (e) {
      setStatus({
        phase: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const disabled = status.phase === 'running' || isPending;
  const label =
    status.phase === 'running'
      ? 'Triggering…'
      : isPending
        ? 'Refreshing…'
        : status.phase === 'success'
          ? 'Run triggered ✓'
          : 'Run Now';

  // Base colors for the button group based on status
  const baseButtonClass = disabled
    ? 'border-slate-700 bg-slate-800 text-slate-400 cursor-not-allowed'
    : status.phase === 'success'
      ? 'border-green-700 bg-green-900/40 text-green-300 hover:bg-green-900/60'
      : status.phase === 'error'
        ? 'border-red-800 bg-red-900/40 text-red-300 hover:bg-red-900/60'
        : 'border-blue-700 bg-blue-900/40 text-blue-300 hover:bg-blue-800/60';

  const scheduleLabel = SCHEDULE_OPTIONS.find((o) => o.value === schedule)?.label || 'Schedule: Off';

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="relative inline-flex items-stretch rounded-md shadow-sm" ref={dropdownRef}>
        
        {/* Main Action Button */}
        <button
          onClick={handleClick}
          disabled={disabled}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-r-0 rounded-l-md transition-colors cursor-pointer ${baseButtonClass}`}
        >
          {status.phase === 'running' && (
            <span
              className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden
            />
          )}
          <span>{label}</span>
        </button>

        {/* Dropdown Toggle Button */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={isUpdatingSchedule}
          title={scheduleLabel}
          className={`inline-flex items-center justify-center px-2 py-2 text-sm font-medium border rounded-r-md transition-colors cursor-pointer ${baseButtonClass} ${isUpdatingSchedule ? 'opacity-50' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {/* Custom Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-md shadow-lg z-10 overflow-hidden">
            {SCHEDULE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleScheduleChange(opt.value)}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 ${
                  schedule === opt.value ? 'bg-slate-800 text-blue-400 font-medium' : 'text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {status.phase === 'success' && (
        <span className="text-xs text-slate-400 max-w-xs text-right">
          {status.message} Auto-refresh in ~75s.
        </span>
      )}
      {status.phase === 'error' && (
        <span className="text-xs text-red-400 max-w-xs text-right">
          Error: {status.error}
        </span>
      )}
    </div>
  );
}
