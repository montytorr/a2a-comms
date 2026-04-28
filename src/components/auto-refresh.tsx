'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useRef, useState } from 'react';

interface AutoRefreshProps {
  intervalMs?: number;
  onlyWhenVisible?: boolean;
  children: React.ReactNode;
}

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
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        if (onlyWhenVisible && !isVisible.current) return;
        doRefresh();
      }, intervalMs);
    }

    const handleVisibility = () => {
      isVisible.current = document.visibilityState === 'visible';
      if (isVisible.current) doRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [doRefresh, intervalMs, onlyWhenVisible, stopPolling]);

  const seconds = Math.round(intervalMs / 1000);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 10 }}
        className="row gap-2">
        <span className={`dot dot--${refreshing ? 'amber' : 'mint'} pulse`} />
        <span className="mono" style={{
          fontSize: 10,
          color: refreshing ? 'var(--amber)' : 'var(--mint)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {refreshing ? 'Syncing' : 'Live'}
        </span>
        <span className="mono num dim" style={{ fontSize: 10 }}>{seconds}s</span>
      </div>
      {children}
    </div>
  );
}
