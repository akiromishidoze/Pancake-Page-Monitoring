'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  scope?: string;
};

export function AutoRefresh({ scope }: Props) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const url = scope ? `/api/sse?scope=${encodeURIComponent(scope)}` : '/api/sse';
      const es = new EventSource(url);
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
  }, [router, scope]);

  return null;
}
