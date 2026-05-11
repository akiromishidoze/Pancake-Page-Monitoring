'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ intervalMs = 60000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      // Seamlessly fetch new RSC payload and merge it
      router.refresh();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [router, intervalMs]);

  // This component is purely functional and renders nothing
  return null;
}
