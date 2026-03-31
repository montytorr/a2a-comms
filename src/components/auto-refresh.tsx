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
 * Shows a "● LIVE" status indicator in the top-right area of the page header.
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
    setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Start the polling interval directly (avoids calling setState in effect body)
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        if (onlyWhenVisible && !isVisible.current) return;
        doRefresh();
      }, intervalMs);
    }

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
  }, [doRefresh, intervalMs, onlyWhenVisible, stopPolling]);

  const seconds = Math.round(intervalMs / 1000);

  return (
    <div className="relative">
      {/* Status indicator — matches Feed page "CONNECTED" style */}
      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        <div className="relative">
          <div className={`w-2 h-2 rounded-full ${refreshing ? 'bg-cyan-300' : 'bg-emerald-400'}`} />
          <div className={`absolute inset-0 w-2 h-2 rounded-full opacity-30 ${refreshing ? 'bg-cyan-300 animate-ping' : 'bg-emerald-400 animate-ping'}`} />
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${refreshing ? 'text-cyan-300' : 'text-emerald-400'}`}>
          {refreshing ? 'Syncing' : 'Live'}
        </span>
        <span className="text-[10px] text-gray-600 font-mono tabular-nums">
          {seconds}s
        </span>
      </div>
      {children}
    </div>
  );
}
