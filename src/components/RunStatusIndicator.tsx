'use client';

import { useEffect, useState } from 'react';
import { useToast } from './Toast';

export function RunStatusIndicator() {
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    async function checkStatus() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        const data = await res.json();

        if (data.ok) {
          setIsRunning(data.isRunning);
        }
      } catch (err) {
        toast('Failed to fetch run status');
      }

      timeoutId = setTimeout(checkStatus, 5000);
    }

    checkStatus();

    return () => clearTimeout(timeoutId);
  }, []);

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-blue-400 font-medium animate-pulse" role="status" aria-live="polite">
        <svg
          className="animate-spin h-4 w-4 text-blue-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
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

  return null;
}
