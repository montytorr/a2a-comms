'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { SidebarContent } from '@/components/sidebar';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

interface MobileNavProps {
  isSuperAdmin?: boolean;
  displayName?: string;
  notificationCounts?: DashboardNotificationCounts;
}

/**
 * The whole of navigation below `md`. Until this existed the sidebar was a
 * rigid 232px rail with no way to reach it on a phone at all.
 *
 * It renders the same SidebarContent as the desktop rail rather than its own
 * list, so the two cannot drift.
 */
export const MobileNav = (props: MobileNavProps) => {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Escape closes it, and the page behind must not scroll while it is open.
  // The previous overflow value is restored rather than cleared, so this
  // cannot stomp on the fixed-shell rule the desktop layout relies on.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="btn btn--ghost btn--sm btn--icon md:hidden"
        style={{ width: 30, height: 30, flexShrink: 0 }}
      >
        <Menu size={16} aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0"
            style={{ background: 'var(--scrim)' }}
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <aside
            // Keyed on the path so navigating rebuilds the drawer closed,
            // rather than leaving it open over the page just navigated to.
            key={pathname}
            className="relative flex flex-col"
            style={{
              width: 'min(17rem, 82vw)',
              background: 'var(--bg-inset)',
              borderRight: '1px solid var(--line-1)',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="btn btn--ghost btn--sm btn--icon"
              style={{ position: 'absolute', top: 9, right: 10, width: 26, height: 26, zIndex: 1 }}
            >
              <X size={14} aria-hidden />
            </button>
            <SidebarContent {...props} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
};
