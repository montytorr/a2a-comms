'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { SidebarContent } from '@/components/sidebar';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

interface MobileNavProps {
  isSuperAdmin?: boolean;
  displayName?: string;
  notificationCounts?: DashboardNotificationCounts;
}

/** Matches the `md` breakpoint the rail and the drawer switch on. */
const DESKTOP_QUERY = '(min-width: 48rem)';

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

  // Widening past `md` hides the drawer by CSS but would leave this component
  // holding `open` — and with it the body scroll lock — until something
  // thought to close it. Close it on the breakpoint itself instead.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => { if (mq.matches) setOpen(false); };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open]);

  const drawer = (
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
          height: '100%',
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
  );

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

      {/* Portalled to <body> deliberately. The trigger is rendered inside the
          topbar, and the topbar carries `backdrop-filter: blur(12px)` — a
          filter makes an element the containing block for its `position:
          fixed` descendants. Rendered in place, `fixed inset-0` resolved
          against the 52px topbar instead of the viewport: the scrim covered
          only the header strip and the drawer's nav list spilled down the
          page, unbacked, over the content it was supposed to cover.

          `document.body` needs no mount guard: `open` starts false and only a
          click can set it, so this branch is unreachable on the server and
          before hydration. */}
      {open && createPortal(drawer, document.body)}
    </>
  );
};
