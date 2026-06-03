'use client';

import { useEffect, useState, useRef } from 'react';

export function LiveTimeAgo({ timestampMs }: { timestampMs: number | null | undefined }) {
  const [now, setNow] = useState(Date.now());
  const [liveTs, setLiveTs] = useState<number | null>(timestampMs ?? null);
  const prevPropRef = useRef(timestampMs ?? null);

  const effectiveTs = liveTs ?? timestampMs ?? null;

  useEffect(() => {
    prevPropRef.current = timestampMs ?? null;
  }, [timestampMs]);

  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const pollId = setInterval(async () => {
      try {
        const res = await fetch('/api/last-run');
        if (!res.ok) return;
        const data = await res.json();
        if (data.lastScheduledRun) {
          if (data.lastScheduledRun !== prevPropRef.current) {
            setLiveTs(data.lastScheduledRun);
          }
        }
      } catch {
        // ignore fetch errors
      }
    }, 15_000);
    return () => clearInterval(pollId);
  }, []);

  const timeAgoText = (() => {
    if (!effectiveTs) return 'No runs received';

    const diffMs = now - effectiveTs;
    if (diffMs < 0) return 'Just now';

    const m = Math.floor(diffMs / 60000);
    const s = Math.floor((diffMs % 60000) / 1000);

    if (m === 0) return `Last run ${s}s ago`;
    if (m < 60) return `Last run ${m}m ${s.toString().padStart(2, '0')}s ago`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h < 24) return `Last run ${h}h ${remM}m ago`;
    const d = Math.floor(h / 24);
    return `Last run ${d}d ${h % 24}h ago`;
  })();

  if (!timeAgoText) return null;

  return <span suppressHydrationWarning>{timeAgoText}</span>;
}
