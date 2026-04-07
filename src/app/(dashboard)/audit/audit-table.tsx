'use client';

import { useState } from 'react';
import Link from 'next/link';
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

type LinkedEntity = {
  href: string;
  label: string;
};

function toId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDetails(entry: AuditLogEntry): Record<string, unknown> | null {
  if (!entry.details || typeof entry.details !== 'object' || Array.isArray(entry.details)) return null;
  return entry.details as Record<string, unknown>;
}

function buildLinks(entry: AuditLogEntry): LinkedEntity[] {
  const links: LinkedEntity[] = [];
  const details = toDetails(entry);
  const resourceType = (entry.resource_type || '').toLowerCase();
  const resourceId = toId(entry.resource_id);
  const detailsResource = details ? toId(details.resource_id) : null;

  const contractId =
    toId(details?.contract_id) || (resourceType === 'contract' ? resourceId : detailsResource);
  const taskId = toId(details?.task_id) || (resourceType === 'task' ? resourceId : null);
  const webhookId = toId(details?.webhook_id) || (resourceType === 'webhook' ? resourceId : null);
  const projectId =
    toId(details?.project_id) || (resourceType === 'project' ? resourceId : null);

  if (contractId) {
    links.push({ href: `/contracts/${contractId}`, label: 'Contract' });
  }

  if (projectId) {
    links.push({ href: `/projects/${projectId}`, label: 'Project' });
  }

  if (taskId) {
    links.push({
      href: projectId
        ? `/projects/${projectId}/tasks/${taskId}`
        : `/protocol-inspector?task=${encodeURIComponent(taskId)}`,
      label: projectId ? 'Task' : 'Task inspector',
    });
  }

  if (webhookId) {
    links.push({
      href: `/webhooks/health?webhook=${encodeURIComponent(webhookId)}`,
      label: 'Webhook deliveries',
    });
    links.push({ href: '/webhooks', label: 'Webhooks' });
  }

  if (resourceType.startsWith('webhook.') && links.length === 0 && resourceId) {
    links.push({ href: `/webhooks/health?webhook=${encodeURIComponent(resourceId)}`, label: 'Webhook deliveries' });
    links.push({ href: '/webhooks', label: 'Webhooks' });
  }

  if (resourceType === 'contract' && !links.some((link) => link.href.includes('/contracts/')) && resourceId) {
    links.push({ href: `/contracts/${resourceId}`, label: 'Contract' });
  }

  if (resourceType === 'project' && !links.some((link) => link.href.includes('/projects/')) && resourceId) {
    links.push({ href: `/projects/${resourceId}`, label: 'Project' });
  }

  if (resourceType === 'task' && !links.some((link) => link.href.includes('/tasks/') || link.href.includes('/protocol-inspector'))) {
    if (projectId && resourceId) {
      links.push({ href: `/projects/${projectId}/tasks/${resourceId}`, label: 'Task' });
    } else if (resourceId) {
      links.push({ href: `/protocol-inspector?task=${encodeURIComponent(resourceId)}`, label: 'Task inspector' });
    }
  }

  const seen = new Set<string>();
  const deduped: LinkedEntity[] = [];
  for (const link of links) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    deduped.push(link);
  }
  return deduped;
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
            const hasDetails = entry.details && Object.keys(entry.details as object).length > 0;
            const actionStyle = getActionStyle(entry.action);
            const links = buildLinks(entry);
            const hasLinks = links.length > 0;
            const canExpand = hasDetails;

            return (
              <div key={entry.id} className="group">
                <div className="flex items-start gap-4 px-6 py-3.5 hover:bg-white/[0.015] transition-all duration-300">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center w-6 shrink-0 pt-0.5">
                    <span className="text-xs">{getActionIcon(entry.action)}</span>
                    {idx < entries.length - 1 && (
                      <div className="w-px flex-1 bg-gradient-to-b from-white/[0.04] to-transparent min-h-[8px]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-3">
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

                    {hasLinks && (
                      <div className="flex flex-wrap gap-2">
                        {links.map((link, linkIdx) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                              linkIdx === 0
                                ? 'border-cyan-300/35 bg-cyan-500/[0.10] text-cyan-200 hover:border-cyan-200/55 hover:bg-cyan-500/[0.16]'
                                : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-gray-200 hover:border-white/[0.14] hover:bg-white/[0.05]'
                            }`}
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-600 font-mono tabular-nums" title={formatDateTime(entry.created_at)}>
                      {formatRelative(entry.created_at)}
                    </span>

                    {canExpand && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="inline-flex items-center justify-center rounded-md border border-white/[0.08] px-1.5 py-1 hover:bg-white/[0.03]"
                        aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
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
                      </button>
                    )}

                    {!canExpand && hasLinks ? (
                      <span className="text-gray-500 text-[10px]">↗</span>
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
