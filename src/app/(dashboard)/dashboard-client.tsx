'use client';

import { useState } from 'react';
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
  Download,
  CheckCircle2,
  XCircle,
  Send,
  Lock,
  Bot,
  Pencil,
  Webhook,
} from 'lucide-react';
import {
  Sparkline,
  HashChip,
  Avatar,
  ProgressBar,
  SectionHeader,
  PageFrame,
} from '@/components/atoms';

// ── Mock sparkline data ───────────────────────────────────────────────────────

const SPARKLINES: Record<string, number[]> = {
  contracts:   [3, 5, 4, 7, 6, 8, 9, 7, 10, 12, 11, 14],
  messages:    [12, 18, 14, 22, 19, 25, 21, 28, 24, 30, 27, 34],
  agents:      [4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9],
  projects:    [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
  tasks:       [2, 3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8],
  webhooks:    [5, 8, 6, 10, 9, 12, 11, 14, 13, 16, 15, 18],
  throughput:  [40, 55, 48, 62, 58, 72, 65, 80, 74, 88, 82, 96],
};

// ── Mock health services ──────────────────────────────────────────────────────

const HEALTH_SERVICES = [
  { name: 'API Gateway',     latency: '12ms',  uptime: 99.98, color: 'var(--mint)'  },
  { name: 'Contract Engine', latency: '34ms',  uptime: 99.91, color: 'var(--mint)'  },
  { name: 'Message Broker',  latency: '8ms',   uptime: 99.99, color: 'var(--mint)'  },
  { name: 'Webhook Relay',   latency: '61ms',  uptime: 98.40, color: 'var(--amber)' },
  { name: 'Auth Service',    latency: '19ms',  uptime: 99.95, color: 'var(--mint)'  },
];

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
}

// ── Segmented control (interactive island) ────────────────────────────────────

const TIME_OPTIONS = ['24h', '7d', '30d'] as const;
type TimeRange = typeof TIME_OPTIONS[number];

const SegControl = ({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) => (
  <div className="seg">
    {TIME_OPTIONS.map(opt => (
      <button
        key={opt}
        className={value === opt ? 'active' : ''}
        onClick={() => onChange(opt)}
      >
        {opt}
      </button>
    ))}
  </div>
);

// ── Stat tile ─────────────────────────────────────────────────────────────────

interface StatTileProps {
  label:     string;
  value:     number | string;
  hint:      string;
  icon:      React.ElementType;
  iconColor: string;
  spark?:    number[];
  sparkColor?: string;
  href:      string;
}

const StatTile = ({ label, value, hint, icon: Icon, iconColor, spark, sparkColor, href }: StatTileProps) => (
  <Link href={href} style={{ textDecoration: 'none' }}>
    <div
      className="card"
      style={{
        padding: 16,
        position: 'relative',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Label + icon row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          className="upper"
          style={{ fontSize: 10, letterSpacing: '0.12em' }}
        >
          {label}
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `${iconColor}22`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: iconColor,
            flexShrink: 0,
          }}
        >
          <Icon size={13} strokeWidth={1.8} />
        </span>
      </div>

      {/* Value */}
      <div
        className="num"
        style={{
          fontSize: 30,
          fontFamily: 'var(--sans)',
          fontWeight: 700,
          color: 'var(--fg-0)',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>

      {/* Hint */}
      <div className="dim" style={{ fontSize: 11 }}>{hint}</div>

      {/* Sparkline pinned bottom-right */}
      {spark && (
        <div style={{ position: 'absolute', bottom: 12, right: 12, opacity: 0.6 }}>
          <Sparkline data={spark} color={sparkColor ?? iconColor} width={72} height={22} />
        </div>
      )}
    </div>
  </Link>
);

// ── System status tile (no sparkline, pulse dot instead) ─────────────────────

const SystemStatusTile = ({ isKillSwitchActive }: { isKillSwitchActive: boolean }) => {
  const color = isKillSwitchActive ? 'var(--rose)' : 'var(--mint)';
  const label = isKillSwitchActive ? 'Kill Switch Active' : 'Operational';
  const hint  = isKillSwitchActive ? 'All operations frozen' : 'All systems nominal';

  return (
    <Link href="/kill-switch" style={{ textDecoration: 'none' }}>
      <div
        className="card"
        style={{
          padding: 16,
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          borderColor: isKillSwitchActive ? 'oklch(0.55 0.10 25 / 0.55)' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="upper" style={{ fontSize: 10, letterSpacing: '0.12em' }}>System Status</span>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: `${color}22`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color,
              flexShrink: 0,
            }}
          >
            <Activity size={13} strokeWidth={1.8} />
          </span>
        </div>

        {/* Pulse dot + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: color,
                opacity: 0.35,
                animation: 'ping 1.4s cubic-bezier(0,0,0.2,1) infinite',
              }}
            />
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: color,
              }}
            />
          </span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color,
              fontFamily: 'var(--sans)',
              lineHeight: 1,
            }}
          >
            {label}
          </span>
        </div>

        <div className="dim" style={{ fontSize: 11 }}>{hint}</div>
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
        className="mono"
        style={{ fontSize: 12, color: 'var(--fg-1)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {entry.actor}
      </span>

      {/* Action type (mono) */}
      <span
        className="mono"
        style={{ fontSize: 11, color: 'var(--fg-3)', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
        className="mono dim"
        style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}
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
}: DashboardClientProps) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  // Stat tiles definition
  const STATS: StatTileProps[] = [
    {
      label:      'Active Contracts',
      value:      activeContracts,
      hint:       'View all contracts →',
      icon:       FileText,
      iconColor:  'oklch(0.78 0.14 165)',
      spark:      SPARKLINES.contracts,
      sparkColor: 'oklch(0.78 0.14 165)',
      href:       '/contracts?status=active',
    },
    {
      label:      'Messages Today',
      value:      messagesToday,
      hint:       'View messages →',
      icon:       MessageSquare,
      iconColor:  'oklch(0.78 0.10 265)',
      spark:      SPARKLINES.messages,
      sparkColor: 'oklch(0.78 0.10 265)',
      href:       '/contracts',
    },
    {
      label:      'Pending Invitations',
      value:      pendingInvitations,
      hint:       'Review project + contract inboxes →',
      icon:       Clock,
      iconColor:  'oklch(0.80 0.155 65)',
      spark:      SPARKLINES.tasks,
      sparkColor: 'oklch(0.80 0.155 65)',
      href:       '/projects',
    },
    {
      label:      'Total Agents',
      value:      totalAgents,
      hint:       'View all agents →',
      icon:       Users,
      iconColor:  'oklch(0.74 0.14 25)',
      spark:      SPARKLINES.agents,
      sparkColor: 'oklch(0.74 0.14 25)',
      href:       '/agents',
    },
    {
      label:      'Active Projects',
      value:      activeProjects,
      hint:       'View projects →',
      icon:       Folder,
      iconColor:  'oklch(0.78 0.14 165)',
      spark:      SPARKLINES.projects,
      sparkColor: 'oklch(0.78 0.14 165)',
      href:       '/projects',
    },
    {
      label:      'Tasks In Progress',
      value:      tasksInProgress,
      hint:       'View tasks →',
      icon:       Zap,
      iconColor:  'oklch(0.78 0.10 265)',
      spark:      SPARKLINES.tasks,
      sparkColor: 'oklch(0.78 0.10 265)',
      href:       '/projects',
    },
    {
      label:      'Webhooks (24h)',
      value:      webhookDeliveries,
      hint:       'View webhooks →',
      icon:       Link2,
      iconColor:  'oklch(0.80 0.155 65)',
      spark:      SPARKLINES.webhooks,
      sparkColor: 'oklch(0.80 0.155 65)',
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
        right={
          <>
            <SegControl value={timeRange} onChange={setTimeRange} />
            <button className="btn btn--ghost btn--sm row gap-2">
              <Download size={13} />
              Export
            </button>
          </>
        }
      />

      {/* 4×2 stat grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1fr',
          gap: 12,
          alignItems: 'start',
        }}
      >
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
              <span className="dim" style={{ fontSize: 11 }}>Latest system events</span>
            </div>
            <Link href="/audit" className="btn btn--ghost btn--sm">
              View all →
            </Link>
          </div>

          {/* Rows */}
          <div style={{ padding: '4px 16px 8px' }}>
            {recentAudit.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '48px 0',
                  gap: 8,
                }}
              >
                <Clock size={20} style={{ color: 'var(--fg-4)' }} />
                <span className="muted" style={{ fontSize: 13 }}>No activity yet</span>
                <span className="dim" style={{ fontSize: 11 }}>Events will appear here as they happen</span>
              </div>
            ) : (
              recentAudit.map(entry => <ActivityRow key={entry.id} entry={entry} />)
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="col gap-3">
          {/* System Health card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              className="row"
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--line-1)',
                justifyContent: 'space-between',
              }}
            >
              <span className="h3">System Health</span>
              <span className="pill pill--mint">Live</span>
            </div>
            <div className="col" style={{ padding: '8px 16px 12px', gap: 12 }}>
              {HEALTH_SERVICES.map(svc => (
                <div key={svc.name} className="col" style={{ gap: 5 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 500 }}>{svc.name}</span>
                    <div className="row gap-2">
                      <span className="mono dim" style={{ fontSize: 11 }}>{svc.latency}</span>
                      <span
                        className="mono"
                        style={{ fontSize: 11, color: svc.uptime >= 99.9 ? 'var(--mint)' : 'var(--amber)' }}
                      >
                        {svc.uptime.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <ProgressBar value={svc.uptime} max={100} color={svc.color} height={3} />
                </div>
              ))}
            </div>
          </div>

          {/* Throughput card */}
          <div className="card" style={{ padding: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="col gap-1">
                <span className="upper" style={{ fontSize: 10 }}>Throughput</span>
                <div
                  className="num"
                  style={{
                    fontSize: 34,
                    fontFamily: 'var(--sans)',
                    fontWeight: 700,
                    color: 'var(--fg-0)',
                    lineHeight: 1,
                  }}
                >
                  96
                </div>
                <span className="dim" style={{ fontSize: 11 }}>msg/min · {timeRange} avg</span>
              </div>
              <div style={{ paddingTop: 4 }}>
                <Sparkline
                  data={SPARKLINES.throughput}
                  color="oklch(0.78 0.14 165)"
                  width={96}
                  height={40}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pulse dot keyframe (injected once) */}
      <style>{`
        @keyframes ping {
          0%   { transform: scale(1);   opacity: 0.35; }
          75%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </PageFrame>
  );
};
