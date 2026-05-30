'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  scope?: string;
};

export function AutoRefresh({ scope }: Props) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const delayRef = useRef(1000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      const url = scope ? `/api/sse?scope=${encodeURIComponent(scope)}` : '/api/sse';
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('refresh', () => {
        router.refresh();
      });

      es.addEventListener('connected', () => {
        delayRef.current = 1000;
      });

      es.addEventListener('error', () => {
        es.close();
        const delay = delayRef.current;
        delayRef.current = Math.min(delayRef.current * 2, 30_000);
        const jitter = Math.random() * 1000;
        timerRef.current = setTimeout(connect, delay + jitter);
      });
    }

    connect();

    return () => {
      if (esRef.current) esRef.current.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router, scope]);

  return null;
}
