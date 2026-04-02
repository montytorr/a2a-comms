'use client';

import { useState } from 'react';
import type { AuditLogEntry } from '@/lib/types';
import { formatRelative, formatDateTime } from '@/lib/format-date';

const actionColors: Record<string, string> = {
  'contract.propose': 'text-violet-400 bg-violet-500/[0.06] border-violet-500/10',
  'contract.accept': 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/10',
  'contract.reject': 'text-red-400 bg-red-500/[0.06] border-red-500/10',
  'contract.close': 'text-gray-400 bg-gray-500/[0.06] border-gray-500/10',
  'message.send': 'text-cyan-400 bg-cyan-500/[0.06] border-cyan-500/10',
  'kill_switch.activate': 'text-red-400 bg-red-500/[0.06] border-red-500/10',
  'kill_switch.deactivate': 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/10',
  'killswitch.activate': 'text-red-400 bg-red-500/[0.06] border-red-500/10',
  'killswitch.deactivate': 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/10',
  // Security events
  'auth.success': 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/10',
  'auth.failure': 'text-amber-400 bg-amber-500/[0.06] border-amber-500/10',
  'authz.denied': 'text-amber-400 bg-amber-500/[0.06] border-amber-500/10',
  'webhook.delivery.success': 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/10',
  'webhook.delivery.failure': 'text-amber-400 bg-amber-500/[0.06] border-amber-500/10',
  'webhook.disabled': 'text-red-400 bg-red-500/[0.06] border-red-500/10',
  'suspicious.replay_detected': 'text-red-400 bg-red-500/[0.06] border-red-500/10',
  'suspicious.invalid_signature': 'text-red-400 bg-red-500/[0.06] border-red-500/10',
  'policy.kill_switch.activated': 'text-red-400 bg-red-500/[0.06] border-red-500/10',
  'policy.kill_switch.deactivated': 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/10',
};

function getActionStyle(action: string): string {
  return actionColors[action] || 'text-gray-400 bg-gray-500/[0.06] border-gray-500/10';
}

function getActionIcon(action: string): string {
  // Security events
  if (action === 'auth.success') return '🔓';
  if (action === 'auth.failure') return '🔐';
  if (action === 'authz.denied') return '🚫';
  if (action.startsWith('webhook.delivery')) return '📡';
  if (action === 'webhook.disabled') return '⛔';
  if (action.startsWith('suspicious.')) return '🚨';
  if (action.startsWith('policy.')) return '🛡️';
  // Standard events
  if (action.includes('propose')) return '📋';
  if (action.includes('accept')) return '✅';
  if (action.includes('reject')) return '❌';
  if (action.includes('close')) return '🔒';
  if (action.includes('message') || action.includes('send')) return '💬';
  if (action.includes('kill') || action.includes('activate')) return '⚡';
  return '•';
}

export default function AuditTable({ entries }: { entries: AuditLogEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.1s' }}>
      {entries.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
              <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 font-medium">No audit entries recorded</p>
          <p className="text-[11px] text-gray-700 mt-1">Events will be logged here as they occur</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.02]">
          {entries.map((entry, idx) => {
            const isExpanded = expandedId === entry.id;
            const hasDetails = entry.details && Object.keys(entry.details).length > 0;
            const actionStyle = getActionStyle(entry.action);
            const isContract = entry.resource_type === 'contract' && entry.resource_id;
            return (
              <div key={entry.id} className="group">
                <div
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.015] transition-all duration-300 ${hasDetails || isContract ? 'cursor-pointer' : ''}`}
                  onClick={() => {
                    if (hasDetails) {
                      setExpandedId(isExpanded ? null : entry.id);
                    } else if (isContract) {
                      window.location.href = `/contracts/${entry.resource_id}`;
                    }
                  }}
                >
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center w-6 shrink-0">
                    <span className="text-xs">{getActionIcon(entry.action)}</span>
                    {idx < entries.length - 1 && (
                      <div className="w-px flex-1 bg-gradient-to-b from-white/[0.04] to-transparent min-h-[8px]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <span className="text-[12px] font-medium text-cyan-400 shrink-0 w-20">{entry.actor}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${actionStyle}`}>
                      {entry.action}
                    </span>
                    {entry.resource_type && (
                      <span className="text-[10px] text-gray-600 hidden sm:inline">{entry.resource_type}</span>
                    )}
                    {entry.resource_id && (
                      <span className="text-[10px] text-gray-700 font-mono truncate hidden md:inline max-w-[200px]">
                        {entry.resource_id}
                      </span>
                    )}
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-600 font-mono tabular-nums" title={formatDateTime(entry.created_at)}>
                      {formatRelative(entry.created_at)}
                    </span>
                    {hasDetails ? (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`text-gray-700 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    ) : isContract ? (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-gray-700 group-hover:text-cyan-400 transition-colors"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    ) : null}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && hasDetails && (
                  <div className="px-6 pb-4 pl-16 animate-fade-in" style={{ animationDuration: '0.15s' }}>
                    <pre className="text-[10px] text-gray-500 bg-[#06060b]/80 border border-white/[0.03] rounded-xl p-4 overflow-x-auto font-mono leading-relaxed selection:bg-cyan-500/20">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
