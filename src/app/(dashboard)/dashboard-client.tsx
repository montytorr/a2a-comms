'use client';


import Link from 'next/link';
import {
  FileText,
  MessageSquare,
  Activity,
  Clock,
  Users,
  Folder,
  Zap,
  Link2,
  CheckCircle2,
  XCircle,
  Send,
  Lock,
  Bot,
  Pencil,
  Webhook,
} from 'lucide-react';
import { HashChip, Avatar, SectionHeader, PageFrame, EmptyState } from '@/components/atoms';
import styles from './dashboard.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type PillVariant = 'mint' | 'amber' | 'peri' | 'rose';

function getActionMeta(action: string): { Icon: React.ElementType; pill: PillVariant; label: string } {
  if (action.includes('propose'))  return { Icon: FileText,      pill: 'amber', label: 'propose'  };
  if (action.includes('accept'))   return { Icon: CheckCircle2,  pill: 'mint',  label: 'accept'   };
  if (action.includes('reject'))   return { Icon: XCircle,       pill: 'rose',  label: 'reject'   };
  if (action.includes('close'))    return { Icon: Lock,           pill: 'peri',  label: 'close'    };
  if (action.includes('message') || action.includes('send'))
                                   return { Icon: Send,           pill: 'peri',  label: 'message'  };
  if (action.includes('kill'))     return { Icon: Zap,            pill: 'rose',  label: 'kill'     };
  if (action.includes('project'))  return { Icon: Folder,         pill: 'peri',  label: 'project'  };
  if (action.includes('task'))     return { Icon: Pencil,         pill: 'amber', label: 'task'     };
  if (action.includes('webhook'))  return { Icon: Webhook,        pill: 'amber', label: 'webhook'  };
  if (action.includes('agent') || action.includes('register'))
                                   return { Icon: Bot,            pill: 'mint',  label: 'agent'    };
  return { Icon: Activity, pill: 'peri', label: action };
}

function getAuditLink(entry: { resource_type?: string; resource_id?: string }): string | null {
  if (!entry.resource_id && !entry.resource_type) return null;
  switch (entry.resource_type) {
    case 'contract': return entry.resource_id ? `/contracts/${entry.resource_id}` : null;
    case 'project':  return entry.resource_id ? `/projects/${entry.resource_id}` : null;
    case 'agent':    return entry.resource_id ? `/agents/${entry.resource_id}` : null;
    case 'task':     return '/projects';
    case 'message':  return '/messages';
    case 'system':   return '/kill-switch';
    default:         return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  created_at: string;
}

interface DashboardClientProps {
  activeContracts:    number;
  messagesToday:      number;
  pendingInvitations: number;
  isKillSwitchActive: boolean;
  totalAgents:        number;
  activeProjects:     number;
  tasksInProgress:    number;
  webhookDeliveries:  number;
  recentAudit:        AuditEntry[];
  latestWebhookDeliveryAt?: string | null;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

interface StatTileProps {
  label:     string;
  value:     number | string;
  hint:      string;
  icon:      React.ElementType;
  iconColor: string;
  href:      string;
}

const StatTile = ({ label, value, hint, icon: Icon, iconColor, href }: StatTileProps) => (
  <Link href={href} className={styles.statLink}>
    <div className={`card ${styles.statCard}`}>
      <div className={styles.statBar}>
        <span>{label}</span>
        <Icon size={16} strokeWidth={1.8} style={{ color: iconColor }} aria-hidden="true" />
      </div>
      <div className={styles.statBody}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statHint}>{hint}</div>
      </div>
    </div>
  </Link>
);

const SystemStatusTile = ({ isKillSwitchActive }: { isKillSwitchActive: boolean }) => {
  const color = isKillSwitchActive ? 'var(--rose)' : 'var(--mint)';
  const label = isKillSwitchActive ? 'Kill switch active' : 'Operational';
  const hint = isKillSwitchActive ? 'All operations frozen' : 'All systems nominal';

  return (
    <Link href="/kill-switch" className={styles.statLink}>
      <div className={`card ${styles.statCard}`} style={isKillSwitchActive ? { borderColor: 'var(--rose-line)' } : undefined}>
        <div className={styles.statBar}>
          <span>System status</span>
          <Activity size={16} strokeWidth={1.8} style={{ color }} aria-hidden="true" />
        </div>
        <div className={styles.statBody}>
          <div className={styles.statStatus} style={{ color }}>
            <span className={`dot ${isKillSwitchActive ? 'dot--rose' : 'dot--mint'}`} aria-hidden="true" />
            {label}
          </div>
          <div className={styles.statHint}>{hint}</div>
        </div>
      </div>
    </Link>
  );
};

// ── Activity row ──────────────────────────────────────────────────────────────

const ActivityRow = ({ entry }: { entry: AuditEntry }) => {
  const { Icon, pill, label } = getActionMeta(entry.action);
  const link = getAuditLink(entry);
  const inner = (
    <div
      className="row gap-2"
      style={{
        padding: '8px 0',
        borderBottom: '1px solid var(--line-1)',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      {/* Avatar */}
      <Avatar name={entry.actor} size={26} />

      {/* Icon */}
      <span style={{ color: 'var(--fg-3)', flexShrink: 0 }}>
        <Icon size={13} strokeWidth={1.8} />
      </span>

      {/* Actor (mono) */}
      <span
        className="mono text-xs"
        style={{ color: 'var(--fg-1)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {entry.actor}
      </span>

      {/* Action type (mono) */}
      <span
        className="mono text-2xs"
        style={{ color: 'var(--fg-3)', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {entry.action}
      </span>

      {/* Pill */}
      <span className={`pill pill--${pill}`} style={{ flexShrink: 0 }}>{label}</span>

      {/* Resource hash */}
      {entry.resource_id && (
        <span style={{ flexShrink: 0 }}>
          <HashChip value={entry.resource_id} copyable={false} />
        </span>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Timestamp */}
      <span
        className="mono dim text-2xs"
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {timeAgo(entry.created_at)}
      </span>
    </div>
  );

  if (link) {
    return (
      <Link key={entry.id} href={link} style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </Link>
    );
  }
  return <div key={entry.id}>{inner}</div>;
};

// ── Main component ────────────────────────────────────────────────────────────

export const DashboardClient = ({
  activeContracts,
  messagesToday,
  pendingInvitations,
  isKillSwitchActive,
  totalAgents,
  activeProjects,
  tasksInProgress,
  webhookDeliveries,
  recentAudit,
  latestWebhookDeliveryAt,
}: DashboardClientProps) => {

  // Stat tiles definition
  const STATS: StatTileProps[] = [
    {
      label:      'Active Contracts',
      value:      activeContracts,
      hint:       'View all contracts →',
      icon:       FileText,
      iconColor:  'var(--mint)',
      href:       '/contracts?status=active',
    },
    {
      label:      'Messages Today',
      value:      messagesToday,
      hint:       'View messages →',
      icon:       MessageSquare,
      iconColor:  'var(--peri)',
      href:       '/contracts',
    },
    {
      label:      'Pending Invitations',
      value:      pendingInvitations,
      hint:       'Review project + contract inboxes →',
      icon:       Clock,
      iconColor:  'var(--amber)',
      href:       '/projects',
    },
    {
      label:      'Total Agents',
      value:      totalAgents,
      hint:       'View all agents →',
      icon:       Users,
      iconColor:  'var(--rose)',
      href:       '/agents',
    },
    {
      label:      'Active Projects',
      value:      activeProjects,
      hint:       'View projects →',
      icon:       Folder,
      iconColor:  'var(--mint)',
      href:       '/projects',
    },
    {
      label:      'Tasks In Progress',
      value:      tasksInProgress,
      hint:       'View tasks →',
      icon:       Zap,
      iconColor:  'var(--peri)',
      href:       '/projects',
    },
    {
      label:      'Webhooks (24h)',
      value:      webhookDeliveries,
      hint:       'View webhooks →',
      icon:       Link2,
      iconColor:  'var(--amber)',
      href:       '/webhooks',
    },
  ];

  return (
    <PageFrame>
      {/* Section header */}
      <SectionHeader
        eyebrow="Overview"
        title="Dashboard"
        sub="System overview and recent activity"
      />

      <div className={styles.statsGrid}>
        {/* Row 1: contracts, messages, system status, pending */}
        <StatTile {...STATS[0]} />
        <StatTile {...STATS[1]} />
        <SystemStatusTile isKillSwitchActive={isKillSwitchActive} />
        <StatTile {...STATS[2]} />

        {/* Row 2: agents, projects, tasks, webhooks */}
        <StatTile {...STATS[3]} />
        <StatTile {...STATS[4]} />
        <StatTile {...STATS[5]} />
        <StatTile {...STATS[6]} />
      </div>

      {/* Bottom 2-col layout */}
      <div className={styles.lowerGrid}>
        {/* ── Recent Activity ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div
            className="row"
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--line-1)',
              justifyContent: 'space-between',
            }}
          >
            <div className="col gap-1">
              <span className="h3">Recent Activity</span>
              <span className="dim text-2xs">Latest system events</span>
            </div>
            <Link href="/audit" className="btn btn--ghost btn--sm">
              View all →
            </Link>
          </div>

          {/* Rows */}
          <div style={{ padding: '4px 16px 8px' }}>
            {recentAudit.length === 0 ? (
              <EmptyState
                icon={<Clock size={20} />}
                title="No activity yet"
                hint="Events appear here as they happen."
              />
            ) : (
              recentAudit.map(entry => <ActivityRow key={entry.id} entry={entry} />)
            )}
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div className="col gap-1">
              <span className="upper text-2xs">Latest Webhook Delivery</span>
              <div
                className="num text-xl"
                style={{
                  
                  fontFamily: 'var(--sans)',
                  fontWeight: 700,
                  color: 'var(--fg-0)',
                  lineHeight: 1.15,
                }}
              >
                {latestWebhookDeliveryAt ? timeAgo(latestWebhookDeliveryAt) : '—'}
              </div>
              <span className="dim text-2xs">
                {latestWebhookDeliveryAt ? latestWebhookDeliveryAt : 'No webhook delivery timestamp recorded yet'}
              </span>
            </div>
          </div>
        </div>
      </div>

    </PageFrame>
  );
};
