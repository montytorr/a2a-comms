'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, RefreshCw, Bell, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Ticker } from '@/components/atoms';
import { useDashboardContext } from '@/app/(dashboard)/dashboard-context';
import type { TickerItem } from '@/lib/live-feed';
import { useNavigationFeedback } from './navigation-feedback';

interface TopbarProps {
  initialTickerItems?: TickerItem[];
  onOpenPalette: () => void;
  /** Rendered at the far left — the mobile nav trigger. */
  leading?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const Topbar = ({ initialTickerItems = [], onOpenPalette, leading, collapsed, onToggleCollapsed }: TopbarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { notificationCounts } = useDashboardContext();
  const { begin } = useNavigationFeedback();
  // Derived per request in lib/dashboard-notifications.ts; there is no read
  // state in the system, so this is "actionable now", not "unread".
  const actionable = notificationCounts?.total ?? 0;
  const [time, setTime] = useState('');
  const [liveItems, setLiveItems] = useState<TickerItem[]>(initialTickerItems);
  /* The indicator was hardcoded mint and always pulsing, wired to nothing —
     a status light that could not report a bad status. It now follows the
     poll that feeds the ticker beside it. */
  const [live, setLive] = useState(true);

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let latestRequestId = 0;
    const load = async () => {
      const requestId = ++latestRequestId;
      try {
        const res = await fetch('/api/internal/live-feed', { cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setLive(false); return; }
        const json = await res.json() as { items?: TickerItem[] };
        const items = Array.isArray(json.items) ? json.items : [];
        if (!cancelled && requestId === latestRequestId && items.length > 0) {
          // Never erase a server-rendered ticker because a transient refresh
          // returns an empty payload. The next successful refresh replaces it.
          setLiveItems(items);
        }
        if (!cancelled) setLive(true);
      } catch {
        if (!cancelled) setLive(false);
        // Header ticker should never break navigation.
      }
    };

    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const displayItems = liveItems;

  return (
    <div
      className="sticky top-0 z-40 flex shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4 md:static"
      style={{
        height: 'var(--topbar-h)',
        borderBottom: '1px solid var(--line-1)',
        background: 'color-mix(in oklab, var(--bg-1) 85%, transparent)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {leading}

      {/* Rail toggle. Desktop only — on a phone the drawer is the mechanism,
          and a 64px icon rail would be most of the screen. */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="btn btn--ghost btn--sm btn--icon hidden md:inline-flex"
          style={{ width: 26, height: 26, flexShrink: 0 }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      )}

      {/* Command palette trigger. Full width control on a phone, a fixed
          320px affordance once there is room for the ticker beside it. */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="text-xs min-w-0 flex-1 md:flex-none md:w-[20rem]"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 28,
          padding: '0 10px',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--radius-2)',
          color: 'var(--fg-3)',
          fontFamily: 'var(--sans)',
          cursor: 'pointer',
        }}
        aria-label="Search or run a command"
      >
        <Search size={13} className="shrink-0" />
        <span className="flex-1 truncate-text text-left">Search or run command…</span>
        <span className="kbd hidden sm:inline-flex">⌘</span>
        <span className="kbd hidden sm:inline-flex">K</span>
      </button>

      {/* Ticker — a scrolling marquee needs room to be legible, so it only
          appears once the viewport is wide enough to give it any. */}
      {displayItems.length > 0 ? (
        <div className="hidden min-w-0 flex-1 lg:flex"><Ticker items={displayItems} /></div>
      ) : (
        <div className="hidden flex-1 lg:block" />
      )}

      {/* Right side */}
      <div className="row gap-2 sm:gap-3 ml-auto md:ml-0" style={{ alignItems: 'center', flexShrink: 0 }}>
        {/* LIVE indicator */}
        <div
          className="row gap-2 hidden sm:flex"
          style={{ alignItems: 'center' }}
          title={live ? 'Live feed connected' : 'Live feed unreachable — last known events shown'}
        >
          <span className={live ? 'dot dot--mint pulse' : 'dot dot--rose'} />
          <span className="mono text-2xs" style={{ color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {live ? 'Live' : 'Stale'}
          </span>
        </div>

        {/* UTC clock */}
        <div className="mono num text-2xs hidden md:block" style={{ color: 'var(--fg-3)' }}>{time} UTC</div>

        <div className="hidden sm:block" style={{ width: 1, height: 18, background: 'var(--line-1)' }} />

        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          title="Refresh"
          aria-label="Refresh current page"
          onClick={() => router.refresh()}
          style={{ width: 26, height: 26 }}
        >
          <RefreshCw size={13} />
        </button>
        <Link
          href="/notifications"
          onNavigate={() => { if (pathname !== '/notifications') begin(); }}
          className="btn btn--ghost btn--sm btn--icon"
          title={actionable > 0 ? `Notifications — ${actionable} needing attention` : 'Notifications'}
          aria-label={
            actionable > 0
              ? `Open notifications, ${actionable} item${actionable === 1 ? '' : 's'} needing attention`
              : 'Open notifications, nothing needing attention'
          }
          style={{ position: 'relative', width: 26, height: 26 }}
        >
          <Bell size={13} />
          {actionable > 0 && (
            <span
              className="count-badge"
              style={{ position: 'absolute', top: -3, right: -3 }}
              aria-hidden
            >
              {actionable > 99 ? '99+' : actionable}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
};
