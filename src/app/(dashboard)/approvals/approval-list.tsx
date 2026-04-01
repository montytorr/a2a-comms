'use client';

import { useState, useTransition } from 'react';
import { handleApprove, handleDeny } from './actions';

interface Approval {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'consumed';
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    'killswitch.activate': 'Kill Switch Activation',
    'key.rotate': 'Key Rotation',
  };
  return map[action] || action;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    consumed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    denied: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${styles[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
      {status}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ApprovalList({
  approvals,
  currentUser,
  isSuperAdmin,
}: {
  approvals: Approval[];
  currentUser: string;
  isSuperAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function doApprove(id: string) {
    setActionId(id);
    setError(null);
    startTransition(async () => {
      try {
        await handleApprove(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to approve');
      }
      setActionId(null);
    });
  }

  function doDeny(id: string) {
    setActionId(id);
    setError(null);
    startTransition(async () => {
      try {
        await handleDeny(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to deny');
      }
      setActionId(null);
    });
  }

  if (approvals.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mx-auto mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
            <path d="M9 12l2 2 4-4" />
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <p className="text-sm text-gray-600">No approval requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/10 text-[12px] text-red-400">
          {error}
        </div>
      )}
      {approvals.map((a) => {
        const isOwnRequest = a.actor === currentUser;
        const canReview = isSuperAdmin && !isOwnRequest && a.status === 'pending';
        const isActioning = isPending && actionId === a.id;

        return (
          <div
            key={a.id}
            className="rounded-2xl glass-card p-5 animate-fade-in"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-2">
                  {statusBadge(a.status)}
                  <span className="text-[13px] font-semibold text-white">
                    {formatAction(a.action)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-600">
                  <span>
                    Requested by <span className="text-gray-400 font-medium">{a.actor}</span>
                  </span>
                  <span className="text-gray-700">·</span>
                  <span>{timeAgo(a.created_at)}</span>
                  {a.reviewed_by && (
                    <>
                      <span className="text-gray-700">·</span>
                      <span>
                        {a.status === 'consumed' ? 'Consumed (was approved)' : a.status === 'approved' ? 'Approved' : 'Denied'} by{' '}
                        <span className="text-gray-400 font-medium">{a.reviewed_by}</span>
                      </span>
                    </>
                  )}
                </div>
                {/* Details */}
                {a.details && Object.keys(a.details).length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-white/[0.015] border border-white/[0.03]">
                    <div className="space-y-1">
                      {Object.entries(a.details)
                        .filter(([k]) => !['executed', 'executed_at', 'executed_by'].includes(k))
                        .map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-[11px]">
                            <span className="text-gray-600 font-medium">{k.replace(/_/g, ' ')}:</span>
                            <span className="text-gray-400 font-mono truncate">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {isOwnRequest && a.status === 'pending' && (
                  <p className="mt-2 text-[10px] text-amber-500/70 font-medium">
                    You cannot approve your own request
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {canReview && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => doApprove(a.id)}
                    disabled={isActioning}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all duration-200 disabled:opacity-50"
                  >
                    {isActioning ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => doDeny(a.id)}
                    disabled={isActioning}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all duration-200 disabled:opacity-50"
                  >
                    {isActioning ? '...' : 'Deny'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
