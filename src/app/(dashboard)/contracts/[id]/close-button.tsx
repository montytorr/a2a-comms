'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { closeContract } from './actions';
import { AlertTriangle, X } from 'lucide-react';

export default function CloseContractButton({
  contractId,
  approvalPendingFrom,
  reasonMin = 10,
}: {
  contractId: string;
  approvalPendingFrom?: string | null;
  /** Shortest reason accepted for closing without approval; the server re-checks. */
  reasonMin?: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const router = useRouter();

  // With the gate pending, the only close on offer is refusing the work, so
  // the dialog asks for the reason instead of offering a plain close.
  const withoutApproval = Boolean(approvalPendingFrom);
  const reasonReady = reason.trim().length >= reasonMin;

  const handleClose = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await closeContract(
        contractId,
        withoutApproval ? { withoutApproval: true, reason: reason.trim() } : {}
      );
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.refresh();
    } catch (err) {
      console.error('Failed to close contract:', err);
      setError('The contract could not be closed. Check your connection and try again.');
      setLoading(false);
      return;
    }
    setLoading(false);
    setConfirming(false);
  };

  return (
    <>
      <button onClick={() => { setError(null); setConfirming(true); }} className="btn btn--danger">
        <X size={13} />Close Contract
      </button>

      {confirming && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
            onClick={() => !loading && setConfirming(false)}
          />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 420, margin: '0 16px',
            background: 'var(--bg-1)', border: '1px solid var(--line-2)',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 24px 80px var(--shadow-strong)',
          }}>
            <div style={{ padding: 28 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 'var(--radius-4)',
                background: 'var(--rose-bg)', border: '1px solid var(--rose-line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <AlertTriangle size={24} style={{ color: 'var(--rose)' }} />
              </div>
              <div className="h2" style={{ textAlign: 'center', marginBottom: 8 }}>
                {withoutApproval ? 'Close without approving' : 'Close Contract'}
              </div>
              <div className="muted text-sm" style={{ textAlign: 'center', lineHeight: 1.5 }}>
                {withoutApproval
                  ? `This contract is waiting for ${approvalPendingFrom} to approve completion (holloway approve-completion ${contractId}). Closing it now records the work as NOT accepted (closed-unapproved). This cannot be undone.`
                  : 'This will permanently close the contract. No more messages can be exchanged. This action cannot be undone.'}
              </div>
              {withoutApproval && (
                <label className="col" style={{ gap: 6, marginTop: 16 }}>
                  <span className="text-sm">Why is the work not being accepted?</span>
                  <textarea
                    className="cp-textarea"
                    rows={3}
                    autoFocus
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={loading}
                    placeholder={`At least ${reasonMin} characters. Every participant sees this.`}
                  />
                </label>
              )}
              {error && (
                <div role="alert" className="text-sm contract-action-error">
                  {error}
                </div>
              )}
            </div>
            <div className="row gap-3" style={{ padding: '0 28px 28px' }}>
              <button
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="btn"
                style={{ flex: 1, justifyContent: 'center', opacity: loading ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={loading || (withoutApproval && !reasonReady)}
                className="btn btn--danger"
                style={{ flex: 1, justifyContent: 'center', opacity: loading || (withoutApproval && !reasonReady) ? 0.5 : 1 }}
              >
                {loading ? 'Closing…' : withoutApproval ? 'Close without approving' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
