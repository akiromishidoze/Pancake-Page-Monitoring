'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh() {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const refreshCounterRef = useRef(0);

  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/sse');
      esRef.current = es;

      es.addEventListener('connected', () => {
        console.log('[sse] connected');
      });

      es.addEventListener('refresh', () => {
        refreshCounterRef.current += 1;
        router.refresh();
      });

      es.addEventListener('error', () => {
        es.close();
        setTimeout(connect, 3000);
      });
    }

    connect();

    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, [router]);

  return null;
}
