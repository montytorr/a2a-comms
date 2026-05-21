'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/atoms';
import {
  LayoutGrid, Activity, BarChart3, Bell, Settings,
  FileText, MessageSquare, Bot, FolderKanban, Radio,
  Webhook, Heart, Power, CheckCircle, ScrollText,
  BookOpen, Shield, Tag, Users, Mail, Code, LogOut,
} from 'lucide-react';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

interface SidebarProps {
  isSuperAdmin?: boolean;
  displayName?: string;
  notificationCounts?: DashboardNotificationCounts;
  isOpen?: boolean;
  onClose?: () => void;
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

const Logo = () => (
  <div className="row gap-2" style={{ alignItems: 'center' }}>
    <div style={{
      width: 26,
      height: 26,
      borderRadius: 6,
      background: 'linear-gradient(135deg, oklch(0.32 0.02 250), oklch(0.20 0.01 250))',
      border: '1px solid var(--line-2)',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.05)',
    }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 3 L7 11 L12 3 Z" stroke="var(--amber)" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="7" cy="3" r="1.4" fill="var(--amber)" />
      </svg>
    </div>
    <div className="col" style={{ lineHeight: 1.1, gap: 2 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg-0)', letterSpacing: '-0.01em' }}>A2A Comms</div>
      <div className="upper" style={{ fontSize: 9.5 }}>Control Plane</div>
    </div>
  </div>
);

export default function Sidebar({ isSuperAdmin, displayName, notificationCounts, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
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
        onClick={onClose}
        className={`nav-item ${active ? 'nav-item--active' : ''}`}
      >
        <span style={{ color: 'inherit', display: 'flex' }}>{iconMap[item.iconName]}</span>
        <span style={{ flex: 1, color: item.danger ? 'var(--rose)' : 'inherit' }}>{item.label}</span>
        {item.badge === 'live' && <span className="dot dot--mint pulse" style={{ marginRight: 2 }} />}
        {item.badge === 'admin' && (
          <span className="pill pill--amber" style={{ height: 16, fontSize: 9, padding: '0 5px' }}>admin</span>
        )}
        {badgeCount > 0 && (
          <span className="pill pill--amber" style={{ height: 16, fontSize: 9, padding: '0 5px' }}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside style={{
      width: isOpen === false ? 0 : 'var(--sidebar-w)',
      flexShrink: 0,
      background: 'oklch(0.13 0.012 250)',
      borderRight: isOpen === false ? 'none' : '1px solid var(--line-1)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      transition: 'width 0.2s',
      position: 'relative',
      zIndex: 50,
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '14px 14px', borderBottom: '1px solid var(--line-1)' }}>
        <Logo />
      </div>

      {/* Navigation */}
      <nav className="scroll" style={{ flex: 1, padding: '8px 0' }}>
        {navGroups.map((group) => (
          <div key={group.label} style={{ marginBottom: 12 }}>
            <div className="upper" style={{ padding: '6px 14px 4px', fontSize: 9.5 }}>{group.label}</div>
            <div>
              {group.items.map(renderNavItem)}
            </div>
          </div>
        ))}

        {isSuperAdmin && (
          <div style={{ marginBottom: 12 }}>
            <div className="upper" style={{ padding: '6px 14px 4px', fontSize: 9.5 }}>Admin</div>
            <div>
              {adminItems.map(renderNavItem)}
            </div>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--line-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <Avatar name={displayName || '?'} size={28} />
        <div className="col" style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 500 }}>{displayName || 'User'}</div>
          {isSuperAdmin && (
            <div className="mono dim" style={{ fontSize: 10 }}>SUPER ADMIN</div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="btn btn--ghost btn--sm btn--icon"
          title="Sign out"
          style={{ width: 26, height: 26 }}
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );
}
