'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/format-date';

interface AnalyticsChartsProps {
  contractsByStatus: Record<string, number>;
  dayLabels: string[];
  dayCounts: number[];
  agentStats: { name: string; count: number }[];
  avgTurns: number;
  totalContracts: number;
  totalMessages: number;
  days: number;
  // New props
  activeProjects: number;
  tasksDone: number;
  avgResponseTimeHours: number | null;
  webhooksFired: number;
  contractDayCounts: number[];
  tasksByStatus: Record<string, number>;
  topContractsByMessages: { title: string; count: number }[];
  hourlyMessageCounts: number[];
}

const statusColors: Record<string, string> = {
  active: 'var(--mint)',
  proposed: 'var(--amber)',
  closed: 'var(--fg-4)',
  rejected: 'var(--rose)',
  expired: 'var(--amber-2)',
  cancelled: 'var(--fg-4)',
};

const statusPillTone: Record<string, string> = {
  active: 'pill--mint',
  proposed: 'pill--amber',
  closed: 'pill--ghost',
  rejected: 'pill--rose',
  expired: 'pill--amber',
  cancelled: 'pill--ghost',
};

const taskStatusColors: Record<string, string> = {
  backlog: 'var(--fg-4)',
  todo: 'var(--amber)',
  'in-progress': 'var(--mint)',
  'in-review': 'var(--peri)',
  done: 'var(--mint)',
  cancelled: 'var(--fg-4)',
};

const barColorVars = [
  'var(--mint)',
  'var(--peri)',
  'var(--amber)',
  'var(--rose)',
  'var(--mint-2)',
  'var(--amber-2)',
];

function buildConicGradient(data: Record<string, number>, colorMap: Record<string, string>): string {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return `conic-gradient(var(--line-1) 0deg 360deg)`;

  const segments: string[] = [];
  let currentDeg = 0;

  for (const [status, count] of Object.entries(data)) {
    const deg = (count / total) * 360;
    const color = colorMap[status] || 'var(--fg-4)';
    segments.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
    currentDeg += deg;
  }

  return `conic-gradient(${segments.join(', ')})`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return formatDate(d);
}

export default function AnalyticsCharts({
  contractsByStatus,
  dayLabels,
  dayCounts,
  agentStats,
  avgTurns,
  totalContracts,
  totalMessages,
  days,
  activeProjects,
  tasksDone,
  avgResponseTimeHours,
  webhooksFired,
  contractDayCounts,
  tasksByStatus,
  topContractsByMessages,
  hourlyMessageCounts,
}: AnalyticsChartsProps) {
  const maxDayCount = Math.max(...dayCounts, 1);
  const maxAgentCount = agentStats.length > 0 ? Math.max(...agentStats.map((a) => a.count), 1) : 1;
  const totalStatusCount = Object.values(contractsByStatus).reduce((s, v) => s + v, 0);
  const totalTaskStatusCount = Object.values(tasksByStatus).reduce((s, v) => s + v, 0);
  const maxContractDayCount = Math.max(...contractDayCounts, 1);
  const maxTopContractMessages = topContractsByMessages.length > 0 ? Math.max(...topContractsByMessages.map(c => c.count), 1) : 1;
  const maxHourlyCount = Math.max(...hourlyMessageCounts, 1);
  const dayTabs = [7, 14, 30];

  return (
    <div style={{ padding: '28px 32px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <p className="upper" style={{ marginBottom: '6px' }}>Insights</p>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 className="h1">Analytics</h1>
            <p className="dim" style={{ marginTop: '4px', fontSize: '13px' }}>Platform activity overview</p>
          </div>

          {/* Day tabs — segmented control */}
          <div className="seg">
            {dayTabs.map((d) => (
              <Link
                key={d}
                href={`/analytics?days=${d}`}
              >
                <button className={days === d ? 'active' : ''}>
                  {d}d
                </button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards — Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
        {[
          { label: 'Total Contracts', value: totalContracts, accentVar: '--peri' },
          { label: 'Messages', value: totalMessages, suffix: ` (${days}d)`, accentVar: '--mint' },
          { label: 'Avg Turns', value: avgTurns, accentVar: '--mint' },
          { label: 'Active Agents', value: agentStats.length, accentVar: '--amber' },
        ].map((card, idx) => (
          <div
            key={card.label}
            className="card animate-fade-in"
            style={{ padding: '18px 20px', animationDelay: `${idx * 0.05}s` }}
          >
            <p className="upper dim" style={{ marginBottom: '8px' }}>{card.label}</p>
            <p className="mono num" style={{ fontSize: '24px', fontWeight: 700, color: `var(${card.accentVar})` }}>
              {card.value}
              {card.suffix && <span className="dim" style={{ fontSize: '11px', fontWeight: 400 }}>{card.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Summary Cards — Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {[
          { label: 'Active Projects', value: activeProjects, accentVar: '--mint' },
          { label: 'Tasks Done', value: tasksDone, suffix: ` (${days}d)`, accentVar: '--mint' },
          { label: 'Avg Response Time', value: avgResponseTimeHours !== null ? `${avgResponseTimeHours}h` : '—', accentVar: '--peri' },
          { label: 'Webhooks Fired', value: webhooksFired, suffix: ` (${days}d)`, accentVar: '--rose' },
        ].map((card, idx) => (
          <div
            key={card.label}
            className="card animate-fade-in"
            style={{ padding: '18px 20px', animationDelay: `${(idx + 4) * 0.05}s` }}
          >
            <p className="upper dim" style={{ marginBottom: '8px' }}>{card.label}</p>
            <p className="mono num" style={{ fontSize: '24px', fontWeight: 700, color: `var(${card.accentVar})` }}>
              {card.value}
              {card.suffix && <span className="dim" style={{ fontSize: '11px', fontWeight: 400 }}>{card.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Donut Chart — Contracts by Status */}
        <div className="card animate-fade-in" style={{ padding: '24px', animationDelay: '0.1s' }}>
          <h2 className="h3" style={{ marginBottom: '2px' }}>Contracts by Status</h2>
          <p className="dim" style={{ fontSize: '11px', marginBottom: '24px' }}>All time distribution</p>

          <div className="row gap-6">
            {/* Donut */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                style={{
                  width: '144px',
                  height: '144px',
                  borderRadius: '50%',
                  background: buildConicGradient(contractsByStatus, statusColors),
                  mask: 'radial-gradient(circle at center, transparent 42px, black 43px)',
                  WebkitMask: 'radial-gradient(circle at center, transparent 42px, black 43px)',
                }}
              />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <span className="mono num" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--fg-0)' }}>{totalStatusCount}</span>
                  <p className="upper dim" style={{ marginTop: '2px' }}>Total</p>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="col gap-2" style={{ flex: 1 }}>
              {Object.entries(contractsByStatus).map(([status, count]) => (
                <div key={status} className="row gap-2">
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '2px',
                      flexShrink: 0,
                      background: statusColors[status] || 'var(--fg-4)',
                    }}
                  />
                  <span style={{ fontSize: '11px', fontWeight: 500, flex: 1, textTransform: 'capitalize', color: 'var(--fg-1)' }}>
                    {status}
                  </span>
                  <span className="mono num dim" style={{ fontSize: '11px' }}>{count}</span>
                  <span className="mono num" style={{ fontSize: '10px', color: 'var(--fg-4)', width: '32px', textAlign: 'right' }}>
                    {totalStatusCount > 0 ? Math.round((count / totalStatusCount) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bar Chart — Per Agent Messages */}
        <div className="card animate-fade-in" style={{ padding: '24px', animationDelay: '0.15s' }}>
          <h2 className="h3" style={{ marginBottom: '2px' }}>Messages per Agent</h2>
          <p className="dim" style={{ fontSize: '11px', marginBottom: '24px' }}>Last {days} days</p>

          {agentStats.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <p className="dim" style={{ fontSize: '13px' }}>No messages in this period</p>
            </div>
          ) : (
            <div className="col gap-2">
              {agentStats.map((agent, idx) => (
                <div key={agent.name}>
                  <div className="row gap-2" style={{ marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--fg-2)', width: '96px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.name}
                    </span>
                    <div style={{ flex: 1, height: '22px', background: 'var(--bg-2)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '4px',
                          transition: 'width 0.7s ease-out',
                          width: `${Math.max(4, (agent.count / maxAgentCount) * 100)}%`,
                          background: barColorVars[idx % barColorVars.length],
                          opacity: 0.6,
                        }}
                      />
                    </div>
                    <span className="mono num dim" style={{ fontSize: '11px', width: '28px', textAlign: 'right' }}>{agent.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bar Chart — Messages per Day */}
        <div className="card animate-fade-in" style={{ padding: '24px', gridColumn: 'span 2', animationDelay: '0.2s' }}>
          <h2 className="h3" style={{ marginBottom: '2px' }}>Messages per Day</h2>
          <p className="dim" style={{ fontSize: '11px', marginBottom: '24px' }}>Last {days} days</p>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '160px' }}>
            {dayLabels.map((label, idx) => {
              const count = dayCounts[idx];
              const heightPct = maxDayCount > 0 ? (count / maxDayCount) * 100 : 0;
              const showLabel = days <= 14 || idx % Math.ceil(days / 14) === 0;
              return (
                <div
                  key={label}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                  className="group"
                  title={`${formatShortDate(label)}: ${count}`}
                >
                  <span className="mono num" style={{ fontSize: '9px', color: 'var(--fg-4)', opacity: 0, transition: 'opacity 0.2s' }}>
                    {count}
                  </span>
                  <div style={{ width: '100%', position: 'relative', height: '120px' }}>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        width: '100%',
                        borderRadius: '2px 2px 0 0',
                        transition: 'height 0.5s ease-out',
                        height: `${Math.max(heightPct > 0 ? 2 : 0, heightPct)}%`,
                        background: 'var(--mint)',
                        opacity: 0.55,
                      }}
                    />
                  </div>
                  {showLabel && (
                    <span className="mono num" style={{ fontSize: '8px', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
                      {formatShortDate(label)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bar Chart — Contracts Created per Day */}
        <div className="card animate-fade-in" style={{ padding: '24px', gridColumn: 'span 2', animationDelay: '0.25s' }}>
          <h2 className="h3" style={{ marginBottom: '2px' }}>Contracts Created per Day</h2>
          <p className="dim" style={{ fontSize: '11px', marginBottom: '24px' }}>Last {days} days</p>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '160px' }}>
            {dayLabels.map((label, idx) => {
              const count = contractDayCounts[idx];
              const heightPct = maxContractDayCount > 0 ? (count / maxContractDayCount) * 100 : 0;
              const showLabel = days <= 14 || idx % Math.ceil(days / 14) === 0;
              return (
                <div
                  key={label}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                  className="group"
                  title={`${formatShortDate(label)}: ${count}`}
                >
                  <span className="mono num" style={{ fontSize: '9px', color: 'var(--fg-4)', opacity: 0, transition: 'opacity 0.2s' }}>
                    {count}
                  </span>
                  <div style={{ width: '100%', position: 'relative', height: '120px' }}>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        width: '100%',
                        borderRadius: '2px 2px 0 0',
                        transition: 'height 0.5s ease-out',
                        height: `${Math.max(heightPct > 0 ? 2 : 0, heightPct)}%`,
                        background: 'var(--peri)',
                        opacity: 0.55,
                      }}
                    />
                  </div>
                  {showLabel && (
                    <span className="mono num" style={{ fontSize: '8px', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
                      {formatShortDate(label)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Donut Chart — Task Status Distribution */}
        <div className="card animate-fade-in" style={{ padding: '24px', animationDelay: '0.3s' }}>
          <h2 className="h3" style={{ marginBottom: '2px' }}>Task Status Distribution</h2>
          <p className="dim" style={{ fontSize: '11px', marginBottom: '24px' }}>All tasks</p>

          {totalTaskStatusCount === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <p className="dim" style={{ fontSize: '13px' }}>No tasks yet</p>
            </div>
          ) : (
            <div className="row gap-6">
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  style={{
                    width: '144px',
                    height: '144px',
                    borderRadius: '50%',
                    background: buildConicGradient(tasksByStatus, taskStatusColors),
                    mask: 'radial-gradient(circle at center, transparent 42px, black 43px)',
                    WebkitMask: 'radial-gradient(circle at center, transparent 42px, black 43px)',
                  }}
                />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span className="mono num" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--fg-0)' }}>{totalTaskStatusCount}</span>
                    <p className="upper dim" style={{ marginTop: '2px' }}>Total</p>
                  </div>
                </div>
              </div>

              <div className="col gap-2" style={{ flex: 1 }}>
                {Object.entries(tasksByStatus).map(([status, count]) => (
                  <div key={status} className="row gap-2">
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '2px',
                        flexShrink: 0,
                        background: taskStatusColors[status] || 'var(--fg-4)',
                      }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 500, flex: 1, textTransform: 'capitalize', color: 'var(--fg-1)' }}>
                      {status}
                    </span>
                    <span className="mono num dim" style={{ fontSize: '11px' }}>{count}</span>
                    <span className="mono num" style={{ fontSize: '10px', color: 'var(--fg-4)', width: '32px', textAlign: 'right' }}>
                      {totalTaskStatusCount > 0 ? Math.round((count / totalTaskStatusCount) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Horizontal Bar Chart — Top Contracts by Messages */}
        <div className="card animate-fade-in" style={{ padding: '24px', animationDelay: '0.35s' }}>
          <h2 className="h3" style={{ marginBottom: '2px' }}>Top Contracts by Messages</h2>
          <p className="dim" style={{ fontSize: '11px', marginBottom: '24px' }}>Top 5 in last {days} days</p>

          {topContractsByMessages.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <p className="dim" style={{ fontSize: '13px' }}>No messages in this period</p>
            </div>
          ) : (
            <div className="col gap-2">
              {topContractsByMessages.map((contract, idx) => (
                <div key={contract.title}>
                  <div className="row gap-2">
                    <span
                      style={{ fontSize: '11px', fontWeight: 500, color: 'var(--fg-2)', width: '112px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={contract.title}
                    >
                      {contract.title}
                    </span>
                    <div style={{ flex: 1, height: '22px', background: 'var(--bg-2)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '4px',
                          transition: 'width 0.7s ease-out',
                          width: `${Math.max(4, (contract.count / maxTopContractMessages) * 100)}%`,
                          background: barColorVars[idx % barColorVars.length],
                          opacity: 0.6,
                        }}
                      />
                    </div>
                    <span className="mono num dim" style={{ fontSize: '11px', width: '28px', textAlign: 'right' }}>{contract.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hourly Activity Heatmap */}
        <div className="card animate-fade-in" style={{ padding: '24px', gridColumn: 'span 2', animationDelay: '0.4s' }}>
          <h2 className="h3" style={{ marginBottom: '2px' }}>Hourly Activity Heatmap</h2>
          <p className="dim" style={{ fontSize: '11px', marginBottom: '24px' }}>Message distribution by hour (UTC) — last {days} days</p>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
            {hourlyMessageCounts.map((count, hour) => {
              const intensity = maxHourlyCount > 0 ? count / maxHourlyCount : 0;
              return (
                <div
                  key={hour}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                  className="group"
                  title={`${hour}:00 UTC — ${count} messages`}
                >
                  <span className="mono num" style={{ fontSize: '9px', color: 'var(--fg-4)', opacity: 0, transition: 'opacity 0.2s' }}>
                    {count}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: '40px',
                      borderRadius: '3px',
                      transition: 'background 0.3s',
                      background: count === 0
                        ? 'var(--bg-2)'
                        : `oklch(0.82 0.14 165 / ${0.12 + intensity * 0.65})`,
                    }}
                  />
                  <span className="mono num" style={{ fontSize: '8px', color: 'var(--fg-4)' }}>
                    {hour.toString().padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
