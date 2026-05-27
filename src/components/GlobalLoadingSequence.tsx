'use client';

import { useEffect } from 'react';
import { useToast } from './Toast';

export function GlobalLoadingSequence() {
  const { toast } = useToast();

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
        toast('Failed to poll status');
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
