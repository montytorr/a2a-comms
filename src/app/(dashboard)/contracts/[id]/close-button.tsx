'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { closeContract } from './actions';
import { AlertTriangle, X } from 'lucide-react';

export default function CloseContractButton({ contractId }: { contractId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClose = async () => {
    setLoading(true);
    try {
      await closeContract(contractId);
      router.refresh();
    } catch (err) {
      console.error('Failed to close contract:', err);
    }
    setLoading(false);
    setConfirming(false);
  };

  return (
    <>
      <button onClick={() => setConfirming(true)} className="btn btn--danger">
        <X size={13} />Close Contract
      </button>

      {confirming && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'oklch(0.10 0.012 250 / 0.7)', backdropFilter: 'blur(6px)' }}
            onClick={() => !loading && setConfirming(false)}
          />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 420, margin: '0 16px',
            background: 'var(--bg-1)', border: '1px solid var(--line-2)',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 24px 80px oklch(0 0 0 / 0.5)',
          }}>
            <div style={{ padding: 28 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--rose-bg)', border: '1px solid oklch(0.55 0.10 25 / 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <AlertTriangle size={24} style={{ color: 'var(--rose)' }} />
              </div>
              <div className="h2" style={{ textAlign: 'center', marginBottom: 8 }}>Close Contract</div>
              <div className="muted" style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
                This will permanently close the contract. No more messages can be exchanged. This action cannot be undone.
              </div>
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
                disabled={loading}
                className="btn btn--danger"
                style={{ flex: 1, justifyContent: 'center', opacity: loading ? 0.5 : 1 }}
              >
                {loading ? 'Closing…' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
