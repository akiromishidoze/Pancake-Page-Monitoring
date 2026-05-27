'use client';

import { useEffect } from 'react';

export function GlobalLoadingSequence() {
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let stopped = false;

    async function checkStatus() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        const data = await res.json();
        if (data.ok) {
          document.body.classList.toggle('is-fetching-data', data.isRunning);
        }
      } catch (err) {
        console.error('Failed to poll global status:', err);
      }
      if (!stopped) timeoutId = setTimeout(checkStatus, 3000);
    }

    checkStatus();
    window.addEventListener('run-started', () => document.body.classList.add('is-fetching-data'));

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
      document.body.classList.remove('is-fetching-data');
    };
  }, []);

  return null;
}
