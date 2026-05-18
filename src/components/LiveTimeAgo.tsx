'use client';

import { useEffect, useState, useMemo } from 'react';

export function LiveTimeAgo({ timestampMs }: { timestampMs: number | null | undefined }) {
  const [now, setNow] = useState(Date.now());

  const timeAgo = useMemo(() => {
    if (!timestampMs) return 'No runs received';

    const diffMs = now - timestampMs;
    if (diffMs < 0) return 'Just now';

    const m = Math.floor(diffMs / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);

    if (m === 0) return `Last run ${s}s ago`;
    return `Last run ${m}m ${s.toString().padStart(2, '0')}s ago`;
  }, [timestampMs, now]);

  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  if (!timeAgo) return null;

  return <span>{timeAgo}</span>;
}
