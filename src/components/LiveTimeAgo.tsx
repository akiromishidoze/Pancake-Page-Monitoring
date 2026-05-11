'use client';

import { useEffect, useState } from 'react';

export function LiveTimeAgo({ timestampMs }: { timestampMs: number | null | undefined }) {
  const [timeAgo, setTimeAgo] = useState<string | null>(null);

  useEffect(() => {
    if (!timestampMs) {
      setTimeAgo('No runs received');
      return;
    }

    const updateTimer = () => {
      const diffMs = Date.now() - timestampMs;
      if (diffMs < 0) {
        setTimeAgo('Just now');
        return;
      }

      const m = Math.floor(diffMs / 60000);
      const s = Math.floor((diffMs % 60000) / 1000);
      
      if (m === 0) {
        setTimeAgo(`Last run ${s}s ago`);
      } else {
        setTimeAgo(`Last run ${m}m ${s.toString().padStart(2, '0')}s ago`);
      }
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [timestampMs]);

  if (!timeAgo) return null;

  return <span>{timeAgo}</span>;
}
