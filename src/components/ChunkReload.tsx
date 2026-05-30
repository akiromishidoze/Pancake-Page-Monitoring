'use client';

import { useEffect } from 'react';

const CHUNK_ERROR = /failed to load chunk|loading chunk/i;

export function ChunkReload() {
  useEffect(() => {
    function handleError(e: ErrorEvent) {
      if (CHUNK_ERROR.test(e.message)) {
        window.location.reload();
      }
    }
    function handleRejection(e: PromiseRejectionEvent) {
      if (e.reason && CHUNK_ERROR.test(String(e.reason?.message ?? e.reason))) {
        window.location.reload();
      }
    }
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
