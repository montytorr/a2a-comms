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
import { NavigationFeedbackProvider } from './navigation-feedback';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

interface DashboardShellProps extends DashboardContextValue {
  initialTickerItems?: TickerItem[];
  children: React.ReactNode;
}

const COLLAPSE_KEY = 'a2a:sidebar-collapsed';

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
  const isWorkspaceDetail = /^\/contracts\/[^/]+\/?$/.test(pathname)
    || /^\/projects\/[^/]+(?:\/tasks\/[^/]+)?\/?$/.test(pathname);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/internal/notifications', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ counts?: DashboardNotificationCounts }> : null)
      .then((payload) => {
        if (!cancelled && payload?.counts) setCounts(payload.counts);
      })
      .catch(() => { /* Header enrichment must never block navigation. */ });
    return () => { cancelled = true; };
  }, []);

  const dashboardContext: DashboardContextValue = {
    isSuperAdmin,
    displayName,
    notificationCounts: counts,
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
          <div className="mx-auto w-full" style={isWorkspaceDetail ? undefined : { maxWidth: 'var(--content-max)' }}>
            <div className="px-4 pt-1 sm:px-6 lg:px-8">
              <ActingAgentSelector />
            </div>
            {children}
          </div>
        </div>
      </main>
        <CommandPalette open={paletteOpen} onClose={setPaletteOpen} isAdmin={isSuperAdmin} />
      </DashboardProvider>
    </NavigationFeedbackProvider>
  );
}
