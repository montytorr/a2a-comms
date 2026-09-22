'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@/lib/auth/browser';
import { Avatar } from '@/components/atoms';
import { ThemeToggle } from '@/components/theme-toggle';
import { HollowayMark } from '@/components/holloway-mark';
import {
  LayoutGrid, Activity, BarChart3, Bell, Settings,
  FileText, MessageSquare, Bot, FolderKanban, Radio, ListChecks,
  Webhook, Heart, Power, CheckCircle, ScrollText,
  BookOpen, Shield, Tag, Users, Mail, Code, LogOut,
} from 'lucide-react';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';
import { useNavigationFeedback } from './navigation-feedback';

interface SidebarProps {
  isSuperAdmin?: boolean;
  displayName?: string;
  notificationCounts?: DashboardNotificationCounts;
  /**
   * Icon-rail mode. Desktop only — the mobile drawer always shows labels,
   * because a 64px rail of unlabelled icons is not navigation on a phone.
   */
  collapsed?: boolean;
  /** Closes the drawer after a tap. Absent on the desktop rail. */
  onNavigate?: () => void;
}

interface NavItemDef {
  href: string;
  label: string;
  iconName: string;
  adminOnly?: boolean;
  danger?: boolean;
  badge?: 'live' | 'admin';
  badgeKey?: keyof DashboardNotificationCounts;
}

interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

const iconMap: Record<string, React.ReactNode> = {
  grid: <LayoutGrid size={15} />,
  activity: <Activity size={15} />,
  chart: <BarChart3 size={15} />,
  bell: <Bell size={15} />,
  gear: <Settings size={15} />,
  doc: <FileText size={15} />,
  msg: <MessageSquare size={15} />,
  agent: <Bot size={15} />,
  folder: <FolderKanban size={15} />,
  checks: <ListChecks size={15} />,
  wave: <Radio size={15} />,
  plug: <Webhook size={15} />,
  pulse: <Heart size={15} />,
  power: <Power size={15} />,
  check: <CheckCircle size={15} />,
  list: <ScrollText size={15} />,
  code: <Code size={15} />,
  shield: <Shield size={15} />,
  book: <BookOpen size={15} />,
  tag: <Tag size={15} />,
  users: <Users size={15} />,
  mail: <Mail size={15} />,
};

const navGroups: NavGroupDef[] = [
  {
    label: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', iconName: 'grid' },
      { href: '/feed', label: 'Live Feed', iconName: 'activity', badge: 'live' },
      { href: '/analytics', label: 'Analytics', iconName: 'chart' },
      { href: '/notifications', label: 'Notifications', iconName: 'bell', badgeKey: 'total' },
      { href: '/settings', label: 'Settings', iconName: 'gear' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/contracts', label: 'Contracts', iconName: 'doc', badgeKey: 'contracts' },
      { href: '/messages', label: 'Messages', iconName: 'msg' },
      { href: '/agents', label: 'Agents', iconName: 'agent' },
      { href: '/projects', label: 'Projects', iconName: 'folder', badgeKey: 'projects' },
      { href: '/tasks', label: 'Tasks', iconName: 'checks' },
      { href: '/protocol-inspector', label: 'Protocol Inspector', iconName: 'wave' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/webhooks', label: 'Webhooks', iconName: 'plug' },
      { href: '/webhooks/health', label: 'Health', iconName: 'pulse' },
      { href: '/kill-switch', label: 'Kill Switch', iconName: 'power', danger: true },
      { href: '/approvals', label: 'Approvals', iconName: 'check', badgeKey: 'approvals' },
      { href: '/audit', label: 'Audit Log', iconName: 'list' },
    ],
  },
  {
    label: 'Documentation',
    items: [
      { href: '/api-docs', label: 'API Reference', iconName: 'code' },
      { href: '/security', label: 'Security', iconName: 'shield' },
      { href: '/onboarding/human', label: 'Human Guide', iconName: 'book' },
      { href: '/onboarding/agent', label: 'Agent Guide', iconName: 'book' },
      { href: '/changelog', label: 'Changelog', iconName: 'tag' },
    ],
  },
];

const adminItems: NavItemDef[] = [
  { href: '/users', label: 'Users', iconName: 'users', adminOnly: true, badge: 'admin' },
  { href: '/admin/emails', label: 'Email Templates', iconName: 'mail', adminOnly: true, badge: 'admin' },
];

const Logo = ({ collapsed }: { collapsed?: boolean }) => (
  <div className="row gap-2" style={{ alignItems: 'center', minWidth: 0 }}>
    <HollowayMark size={28} />
    {!collapsed && (
      <div className="col" style={{ lineHeight: 1.1, gap: 2, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--fg-0)', letterSpacing: '-0.01em' }} className="text-sm truncate-text">Holloway</div>
        <div className="upper truncate-text">Control Plane</div>
      </div>
    )}
  </div>
);

/**
 * The sidebar's contents, with no outer frame of its own.
 *
 * It has two homes — the fixed rail on a wide screen and the drawer on a
 * narrow one — and lives here so the two cannot drift apart. A phone showing
 * a different set of destinations from the desktop is worse than no phone
 * navigation at all.
 */
export function SidebarContent({ isSuperAdmin, displayName, notificationCounts, collapsed, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { begin } = useNavigationFeedback();

  const handleLogout = async () => {
    const db = createBrowserClient();
    await db.auth.signOut();
    window.location.href = '/login';
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const renderNavItem = (item: NavItemDef) => {
    const active = isActive(item.href);
    const badgeCount = item.badgeKey ? (notificationCounts?.[item.badgeKey] ?? 0) : 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        onNavigate={() => { onNavigate?.(); begin(); }}
        className={`nav-item ${active ? 'nav-item--active' : ''}`}
        // In rail mode the label is hidden, so the icon needs to say what the
        // destination is on hover.
        title={collapsed ? item.label : undefined}
      >
        <span style={{ color: 'inherit', display: 'flex', flexShrink: 0 }}>{iconMap[item.iconName]}</span>
        <span className="nav-label truncate-text" style={{ flex: 1, color: item.danger ? 'var(--rose)' : 'inherit' }}>{item.label}</span>
        {item.badge === 'live' && <span className="dot dot--mint pulse nav-trailing" style={{ marginRight: 2 }} />}
        {item.badge === 'admin' && (
          <span className="pill pill--amber nav-trailing" style={{ height: 16, padding: '0 5px' }}>admin</span>
        )}
        {badgeCount > 0 && (
          <span className="pill pill--amber nav-trailing" style={{ height: 16, padding: '0 5px' }}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    );
  };

  const renderGroup = (label: string, items: NavItemDef[]) => (
    <div key={label} style={{ marginBottom: 12 }}>
      {/* In rail mode the group heading becomes a rule: the label would not
          fit in 64px, but the grouping it conveys still should. */}
      {collapsed
        ? <div className="nav-group-rule" role="presentation" />
        : <div className="upper" style={{ padding: '6px 14px 4px' }}>{label}</div>}
      <div>{items.map(renderNavItem)}</div>
    </div>
  );

  return (
    <>
      {/* Height is taken from --topbar-h rather than from padding plus the
          logo's own metrics, which is what left this block ~15px taller than
          the topbar so their bottom borders never lined up. */}
      <div style={{
        height: 'var(--topbar-h)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? 0 : '0 14px',
        borderBottom: '1px solid var(--line-1)',
      }}>
        <Logo collapsed={collapsed} />
      </div>

      <nav className="scroll" style={{ flex: 1, padding: '8px 0', minHeight: 0 }}>
        {navGroups.map((group) => renderGroup(group.label, group.items))}
        {isSuperAdmin && renderGroup('Admin', adminItems)}
      </nav>

      <div style={{
        padding: collapsed ? '10px 0' : 12,
        borderTop: '1px solid var(--line-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 10,
        flexShrink: 0,
      }}>
        <Avatar name={displayName || '?'} size={28} />
        {!collapsed && (
          <>
            <div className="col" style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <div className="text-xs truncate-text" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{displayName || 'User'}</div>
              {isSuperAdmin && <div className="mono dim text-2xs">SUPER ADMIN</div>}
            </div>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="btn btn--ghost btn--sm btn--icon"
              title="Sign out"
              aria-label="Sign out"
              style={{ width: 26, height: 26 }}
            >
              <LogOut size={13} />
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** The desktop rail. Hidden below `md`, where MobileNav takes over. */
export default function Sidebar(props: SidebarProps) {
  return (
    <aside
      // Redefines --sidebar-w for this subtree via the [data-sidebar] hooks
      // that already existed in globals.css but were never written by anything.
      data-sidebar={props.collapsed ? 'icons' : undefined}
      className="hidden md:flex"
      style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        background: 'var(--bg-inset)',
        borderRight: '1px solid var(--line-1)',
        flexDirection: 'column',
        height: '100%',
        transition: 'width 0.2s',
        position: 'relative',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      <SidebarContent {...props} />
    </aside>
  );
}
