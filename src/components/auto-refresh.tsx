'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useRef } from 'react';

interface AutoRefreshProps {
  /** Polling interval in milliseconds (default: 15000 = 15s) */
  intervalMs?: number;
  /** Only refresh when tab is visible (default: true) */
  onlyWhenVisible?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps children and periodically calls router.refresh() to re-fetch
 * server component data without a full page reload.
 */
export default function AutoRefresh({
  intervalMs = 15000,
  onlyWhenVisible = true,
  children,
}: AutoRefreshProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisible = useRef(true);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (onlyWhenVisible && !isVisible.current) return;
      router.refresh();
    }, intervalMs);
  }, [router, intervalMs, onlyWhenVisible]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startPolling();

    const handleVisibility = () => {
      isVisible.current = document.visibilityState === 'visible';
      if (isVisible.current) {
        // Immediate refresh when tab becomes visible again
        router.refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startPolling, stopPolling, router]);

  return <>{children}</>;
}
