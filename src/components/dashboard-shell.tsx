'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePersistedToggle } from '@/lib/persisted-toggle';
import Sidebar from './sidebar';
import { Topbar } from './topbar';
import { MobileNav } from './mobile-nav';
import { CommandPalette } from './command-palette';
import type { TickerItem } from '@/lib/live-feed';
import { DashboardProvider, type DashboardContextValue } from '@/app/(dashboard)/dashboard-context';
import ActingAgentSelector from '@/app/(dashboard)/acting-agent-selector';
import { NavigationFeedbackProvider, useNavigationFeedback } from './navigation-feedback';
import RouteSkeleton from './route-skeleton';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

interface DashboardShellProps extends DashboardContextValue {
  initialTickerItems?: TickerItem[];
  children: React.ReactNode;
}

const COLLAPSE_KEY = 'a2a:sidebar-collapsed';

const fetchNotificationCounts = async (signal?: AbortSignal): Promise<DashboardNotificationCounts | null> => {
  try {
    const response = await fetch('/api/internal/notifications', { cache: 'no-store', signal });
    if (!response.ok) return null;
    const payload = await response.json() as { counts?: DashboardNotificationCounts };
    return payload?.counts ?? null;
  } catch {
    // Header enrichment must never block navigation.
    return null;
  }
};

function DashboardPageContent({ children }: { children: React.ReactNode }) {
  const { pending } = useNavigationFeedback();
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!pending) {
      const reset = window.setTimeout(() => setShowSkeleton(false), 0);
      return () => window.clearTimeout(reset);
    }
    const timer = window.setTimeout(() => setShowSkeleton(true), 180);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return pending && showSkeleton ? <RouteSkeleton /> : <>{children}</>;
}

export default function DashboardShell({
  isSuperAdmin,
  displayName,
  notificationCounts,
  actor,
  initialTickerItems = [],
  children,
}: DashboardShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, toggleCollapsed] = usePersistedToggle(COLLAPSE_KEY);
  const [counts, setCounts] = useState<DashboardNotificationCounts | undefined>(notificationCounts);
  const pathname = usePathname();

  // The shell lives in the persistent layout and is not remounted by client
  // navigation, so a count fetched once on mount goes stale for the rest of the
  // session: answer a question and the badge keeps saying 1 while the page
  // says 0. Refetch on every navigation and whenever the tab becomes visible.
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const next = await fetchNotificationCounts(controller.signal);
      if (next && !controller.signal.aborted) setCounts(next);
    };
    void load();
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const next = await fetchNotificationCounts();
      if (next) setCounts(next);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const dashboardContext: DashboardContextValue = {
    isSuperAdmin,
    displayName,
    notificationCounts: counts,
    setNotificationCounts: setCounts,
    actor,
  };

  return (
    <NavigationFeedbackProvider>
      <DashboardProvider value={dashboardContext}>
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        displayName={displayName}
        notificationCounts={counts}
        collapsed={collapsed}
      />
      <main className="flex min-w-0 flex-1 flex-col md:h-full">
        <Topbar
          initialTickerItems={initialTickerItems}
          onOpenPalette={() => setPaletteOpen(true)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          leading={
            <MobileNav
              isSuperAdmin={isSuperAdmin}
              displayName={displayName}
              notificationCounts={counts}
            />
          }
        />
        {/* Only this element scrolls on desktop; below `md` the document does,
            so the inner scroller is released or the page ends up with a
            scroll container inside a scrolling document. */}
        <div className="min-h-0 flex-1 md:overflow-auto">
          {/* children used to be a sibling of the padded acting-agent row, so
              the two were inset by different amounts — a permanent 16px step
              down the left edge of every page. One wrapper now pads both. */}
          <div className="w-full">
            <div className="px-4 pt-1 sm:px-6 lg:px-8">
              <ActingAgentSelector />
            </div>
            <DashboardPageContent>{children}</DashboardPageContent>
          </div>
        </div>
      </main>
        <CommandPalette open={paletteOpen} onClose={setPaletteOpen} isAdmin={isSuperAdmin} />
      </DashboardProvider>
    </NavigationFeedbackProvider>
  );
}
