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
    function onRunStarted() { document.body.classList.add('is-fetching-data'); }
    window.addEventListener('run-started', onRunStarted);

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
      window.removeEventListener('run-started', onRunStarted);
      document.body.classList.remove('is-fetching-data');
    };
  }, []);

  return null;
}
