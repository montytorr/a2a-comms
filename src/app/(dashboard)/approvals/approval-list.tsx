'use client';

import { useState, useTransition } from 'react';
import { handleApprove, handleDeny } from './actions';
import { ShieldCheck } from 'lucide-react';

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

function statusPill(status: string) {
  const toneClass: Record<string, string> = {
    pending: 'pill--amber',
    approved: 'pill--mint',
    consumed: 'pill--peri',
    denied: 'pill--rose',
  };
  return (
    <span className={`pill ${toneClass[status] || ''}`}>
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
      <div style={{ textAlign: 'center', padding: '64px 0' }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'var(--bg-2)',
          border: '1px solid var(--line-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <ShieldCheck size={18} style={{ color: 'var(--fg-4)' }} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-3)' }}>No approval requests</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 6,
          background: 'var(--rose-bg)',
          border: '1px solid oklch(0.40 0.08 25 / 0.4)',
          fontSize: 12,
          color: 'var(--rose)',
        }}>
          {error}
        </div>
      )}
      {approvals.map((a) => {
        const isOwnRequest = a.actor === currentUser;
        const canReview = isSuperAdmin && !isOwnRequest && a.status === 'pending';
        const isActioning = isPending && actionId === a.id;

        return (
          <div key={a.id} className="card animate-fade-in" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row gap-2" style={{ marginBottom: 8 }}>
                  {statusPill(a.status)}
                  <span className="h3">{formatAction(a.action)}</span>
                </div>
                <div className="row gap-3" style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                  <span>
                    Requested by <span style={{ color: 'var(--fg-2)', fontWeight: 500 }}>{a.actor}</span>
                  </span>
                  <span style={{ color: 'var(--fg-4)' }}>·</span>
                  <span>{timeAgo(a.created_at)}</span>
                  {a.reviewed_by && (
                    <>
                      <span style={{ color: 'var(--fg-4)' }}>·</span>
                      <span>
                        {a.status === 'consumed' ? 'Consumed (was approved)' : a.status === 'approved' ? 'Approved' : 'Denied'} by{' '}
                        <span style={{ color: 'var(--fg-2)', fontWeight: 500 }}>{a.reviewed_by}</span>
                      </span>
                    </>
                  )}
                </div>
                {/* Details */}
                {a.details && Object.keys(a.details).length > 0 && (
                  <div className="card--inset" style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 6,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(a.details)
                        .filter(([k]) => !['executed', 'executed_at', 'executed_by'].includes(k))
                        .map(([k, v]) => (
                          <div key={k} className="row gap-2" style={{ fontSize: 12 }}>
                            <span style={{ color: 'var(--fg-3)', fontWeight: 500 }}>{k.replace(/_/g, ' ')}:</span>
                            <span className="mono" style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {isOwnRequest && a.status === 'pending' && (
                  <p style={{ marginTop: 8, fontSize: 11, color: 'var(--amber)', fontWeight: 500 }}>
                    You cannot approve your own request
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {canReview && (
                <div className="row gap-2" style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => doApprove(a.id)}
                    disabled={isActioning}
                    className="btn btn--sm"
                    style={{
                      background: 'var(--mint-bg)',
                      borderColor: 'oklch(0.50 0.10 165 / 0.4)',
                      color: 'var(--mint)',
                    }}
                  >
                    {isActioning ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => doDeny(a.id)}
                    disabled={isActioning}
                    className="btn btn--sm btn--danger"
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
