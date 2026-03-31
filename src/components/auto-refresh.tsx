'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useRef, useState } from 'react';

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
 *
 * Shows a subtle pulsing indicator dot in the top-right corner.
 */
export default function AutoRefresh({
  intervalMs = 15000,
  onlyWhenVisible = true,
  children,
}: AutoRefreshProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisible = useRef(true);
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    // Brief flash — reset after 600ms
    setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (onlyWhenVisible && !isVisible.current) return;
      doRefresh();
    }, intervalMs);
  }, [doRefresh, intervalMs, onlyWhenVisible]);

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
        doRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startPolling, stopPolling, doRefresh]);

  const seconds = Math.round(intervalMs / 1000);

  return (
    <div className="relative">
      {/* Polling indicator */}
      <div className="absolute top-2 right-2 z-10 group">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-40 ${
              refreshing
                ? 'bg-cyan-300 animate-ping'
                : 'bg-cyan-500/60 animate-pulse'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 transition-colors duration-300 ${
              refreshing ? 'bg-cyan-300' : 'bg-cyan-500/50'
            }`}
          />
        </span>
        {/* Tooltip */}
        <div className="absolute right-0 top-full mt-1.5 px-2 py-1 rounded-md bg-gray-900/95 border border-white/10 text-[10px] text-gray-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          Auto-refreshing every {seconds}s
        </div>
      </div>
      {children}
    </div>
  );
}
