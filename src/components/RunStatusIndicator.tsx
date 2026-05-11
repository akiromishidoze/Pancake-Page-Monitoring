'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function RunStatusIndicator() {
  const [isRunning, setIsRunning] = useState(false);
  const [nextRunTime, setNextRunTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  
  const router = useRouter();
  const wasRunningRef = useRef(false);

  // Poll for status from the server every 5 seconds
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    async function checkStatus() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        const data = await res.json();
        
        if (data.ok) {
          setIsRunning(data.isRunning);
          setNextRunTime(data.nextRunTime);
          
          // If it just transitioned from running to NOT running, refresh the page immediately
          if (wasRunningRef.current && !data.isRunning) {
            router.refresh();
          }
          
          wasRunningRef.current = data.isRunning;
        }
      } catch (err) {
        console.error('Failed to fetch run status:', err);
      }
      
      timeoutId = setTimeout(checkStatus, 5000);
    }

    checkStatus();

    return () => clearTimeout(timeoutId);
  }, [router]);

  // Live countdown timer that updates every second
  useEffect(() => {
    if (isRunning || !nextRunTime) {
      setTimeRemaining(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const diffMs = nextRunTime - now;

      if (diffMs <= 0) {
        setTimeRemaining('Pending...');
        return;
      }

      const m = Math.floor(diffMs / 60000);
      const s = Math.floor((diffMs % 60000) / 1000);
      setTimeRemaining(`${m}m ${s.toString().padStart(2, '0')}s`);
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);

    return () => clearInterval(intervalId);
  }, [nextRunTime, isRunning]);

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-blue-400 font-medium animate-pulse">
        <svg
          className="animate-spin h-4 w-4 text-blue-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span>Fetching latest data...</span>
      </div>
    );
  }

  if (timeRemaining) {
    return (
      <div className="mt-2 text-sm text-slate-400">
        Next fetch in: <span className="font-mono text-slate-300">{timeRemaining}</span>
      </div>
    );
  }

  return null;
}
