'use client';

import { useEffect, useState } from 'react';

export function GlobalLoadingSequence() {
  const [isRunning, setIsRunning] = useState(false);

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
        console.error('Failed to poll global status:', err);
      }
      timeoutId = setTimeout(checkStatus, 3000);
    }
    
    checkStatus();
    
    // Listen for instant manual triggers
    const handleInstantRun = () => setIsRunning(true);
    window.addEventListener('run-started', handleInstantRun);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('run-started', handleInstantRun);
    };
  }, []);

  if (!isRunning) return null;

  return (
    <style>{`
      .dashboard-data {
        opacity: 0.5 !important;
        pointer-events: none !important;
        transition: opacity 0.3s ease-in-out !important;
        animation: data-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
      }
      
      @keyframes data-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.3; }
      }
    `}</style>
  );
}
