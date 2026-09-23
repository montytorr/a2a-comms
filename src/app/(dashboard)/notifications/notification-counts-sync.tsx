'use client';

import { useEffect } from 'react';
import { useDashboardContext } from '../dashboard-context';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

/**
 * The notifications page computes the authoritative counts on every render
 * (including each live refresh). Pushing them into the shell makes the badge
 * match the page exactly while it is open, instead of trusting an older fetch.
 */
export const NotificationCountsSync = ({ counts }: { counts: DashboardNotificationCounts }) => {
  const { setNotificationCounts } = useDashboardContext();

  useEffect(() => {
    setNotificationCounts?.(counts);
  }, [counts, setNotificationCounts]);

  return null;
};
