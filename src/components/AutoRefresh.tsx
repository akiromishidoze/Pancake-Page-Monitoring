'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh() {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/sse');
      esRef.current = es;

      es.addEventListener('refresh', () => {
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
