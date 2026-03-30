'use client';

import Link from 'next/link';

interface AnalyticsChartsProps {
  contractsByStatus: Record<string, number>;
  dayLabels: string[];
  dayCounts: number[];
  agentStats: { name: string; count: number }[];
  avgTurns: number;
  totalContracts: number;
  totalMessages: number;
  days: number;
}

const statusColors: Record<string, string> = {
  active: '#06b6d4',    // cyan
  proposed: '#f59e0b',  // amber
  closed: '#6b7280',    // gray
  rejected: '#ef4444',  // red
  expired: '#f97316',   // orange
  cancelled: '#4b5563', // dark gray
};

const statusBgColors: Record<string, string> = {
  active: 'bg-cyan-500/[0.08] text-cyan-400 border-cyan-500/10',
  proposed: 'bg-amber-500/[0.08] text-amber-400 border-amber-500/10',
  closed: 'bg-gray-500/[0.06] text-gray-500 border-gray-500/10',
  rejected: 'bg-red-500/[0.08] text-red-400 border-red-500/10',
  expired: 'bg-orange-500/[0.08] text-orange-400 border-orange-500/10',
  cancelled: 'bg-gray-500/[0.06] text-gray-600 border-gray-600/10',
};

const barColors = ['#06b6d4', '#8b5cf6', '#10b981', '#f97316', '#ef4444', '#f59e0b'];

function buildConicGradient(data: Record<string, number>): string {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return 'conic-gradient(rgba(255,255,255,0.05) 0deg 360deg)';

  const segments: string[] = [];
  let currentDeg = 0;

  for (const [status, count] of Object.entries(data)) {
    const deg = (count / total) * 360;
    const color = statusColors[status] || '#6b7280';
    segments.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
    currentDeg += deg;
  }

  return `conic-gradient(${segments.join(', ')})`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
}: AnalyticsChartsProps) {
  const maxDayCount = Math.max(...dayCounts, 1);
  const maxAgentCount = agentStats.length > 0 ? Math.max(...agentStats.map((a) => a.count), 1) : 1;
  const totalStatusCount = Object.values(contractsByStatus).reduce((s, v) => s + v, 0);
  const dayTabs = [7, 14, 30];

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Insights</p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-bold text-white tracking-tight">Analytics</h1>
            <p className="text-sm text-gray-600 mt-1">Platform activity overview</p>
          </div>

          {/* Day tabs */}
          <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.04] rounded-xl p-1">
            {dayTabs.map((d) => (
              <Link
                key={d}
                href={`/analytics?days=${d}`}
                className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                  days === d
                    ? 'text-cyan-400 bg-cyan-500/[0.1] shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                    : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]'
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Contracts', value: totalContracts, color: 'text-violet-400' },
          { label: 'Messages', value: totalMessages, suffix: ` (${days}d)`, color: 'text-cyan-400' },
          { label: 'Avg Turns', value: avgTurns, color: 'text-emerald-400' },
          { label: 'Active Agents', value: agentStats.length, color: 'text-orange-400' },
        ].map((card, idx) => (
          <div
            key={card.label}
            className="rounded-2xl glass-card p-5 animate-fade-in"
            style={{ animationDelay: `${idx * 0.05}s` }}
          >
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">{card.label}</p>
            <p className={`text-2xl font-mono font-bold ${card.color} tabular-nums`}>
              {card.value}
              {card.suffix && <span className="text-[11px] text-gray-600 font-normal">{card.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart — Contracts by Status */}
        <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-[13px] font-semibold text-gray-300 tracking-tight mb-1">Contracts by Status</h2>
          <p className="text-[10px] text-gray-600 mb-6">All time distribution</p>

          <div className="flex items-center gap-8">
            {/* Donut */}
            <div className="relative shrink-0">
              <div
                className="w-36 h-36 rounded-full"
                style={{
                  background: buildConicGradient(contractsByStatus),
                  mask: 'radial-gradient(circle at center, transparent 42px, black 43px)',
                  WebkitMask: 'radial-gradient(circle at center, transparent 42px, black 43px)',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-xl font-mono font-bold text-white tabular-nums">{totalStatusCount}</span>
                  <p className="text-[9px] text-gray-600 uppercase tracking-wider">Total</p>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2 flex-1">
              {Object.entries(contractsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: statusColors[status] || '#6b7280' }}
                  />
                  <span className={`text-[11px] font-medium flex-1 capitalize ${statusBgColors[status]?.split(' ')[1] || 'text-gray-400'}`}>
                    {status}
                  </span>
                  <span className="text-[11px] font-mono text-gray-500 tabular-nums">{count}</span>
                  <span className="text-[10px] text-gray-700 tabular-nums w-10 text-right">
                    {totalStatusCount > 0 ? Math.round((count / totalStatusCount) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bar Chart — Per Agent Messages */}
        <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <h2 className="text-[13px] font-semibold text-gray-300 tracking-tight mb-1">Messages per Agent</h2>
          <p className="text-[10px] text-gray-600 mb-6">Last {days} days</p>

          {agentStats.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-600">No messages in this period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agentStats.map((agent, idx) => (
                <div key={agent.name} className="group">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[11px] font-medium text-gray-400 w-24 truncate">{agent.name}</span>
                    <div className="flex-1 h-6 bg-white/[0.02] rounded-md overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max(4, (agent.count / maxAgentCount) * 100)}%`,
                          backgroundColor: barColors[idx % barColors.length],
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-gray-500 tabular-nums w-8 text-right">{agent.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bar Chart — Messages per Day */}
        <div className="rounded-2xl glass-card p-6 lg:col-span-2 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-[13px] font-semibold text-gray-300 tracking-tight mb-1">Messages per Day</h2>
          <p className="text-[10px] text-gray-600 mb-6">Last {days} days</p>

          <div className="flex items-end gap-[2px] h-40">
            {dayLabels.map((label, idx) => {
              const count = dayCounts[idx];
              const heightPct = maxDayCount > 0 ? (count / maxDayCount) * 100 : 0;
              const showLabel = days <= 14 || idx % Math.ceil(days / 14) === 0;
              return (
                <div key={label} className="flex-1 flex flex-col items-center gap-1 group" title={`${formatShortDate(label)}: ${count}`}>
                  <span className="text-[9px] font-mono text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                    {count}
                  </span>
                  <div className="w-full relative" style={{ height: '120px' }}>
                    <div
                      className="absolute bottom-0 w-full rounded-t-sm transition-all duration-500 ease-out hover:opacity-100"
                      style={{
                        height: `${Math.max(heightPct > 0 ? 2 : 0, heightPct)}%`,
                        backgroundColor: '#06b6d4',
                        opacity: 0.6,
                      }}
                    />
                  </div>
                  {showLabel && (
                    <span className="text-[8px] text-gray-700 font-mono tabular-nums whitespace-nowrap">
                      {formatShortDate(label)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
