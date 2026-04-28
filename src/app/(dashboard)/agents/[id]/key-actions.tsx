'use client';

import { useState } from 'react';
import { rotateAgentKey, type RotateKeyResult } from './actions';

export default function KeyActions({ agentId }: { agentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RotateKeyResult | null>(null);
  const [copied, setCopied] = useState<'keyId' | 'secret' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRotate() {
    setLoading(true);
    setError(null);
    const res = await rotateAgentKey(agentId);
    if (res.success && res.approvalRequired) {
      setConfirming(false);
      alert(`Key rotation requires approval from another admin. Request submitted (ID: ${res.approvalId}). Check the Approvals page.`);
    } else if (res.success) {
      setResult(res);
      setConfirming(false);
    } else {
      setError(res.error || 'Failed to rotate key');
    }
    setLoading(false);
  }

  function copyToClipboard(text: string, field: 'keyId' | 'secret') {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="btn btn--ghost btn--sm"
        style={{ color: 'var(--amber)', borderColor: 'var(--amber-bg)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        Rotate Key
      </button>

      {/* New credentials card (shown after rotation) */}
      {result && (
        <div style={{ borderRadius: '0.75rem', background: 'var(--amber-bg)', border: '1px solid var(--amber)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', marginBottom: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--amber)', flexShrink: 0, marginTop: '0.125rem' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--mint)', fontWeight: 600, marginBottom: '0.25rem' }}>Key rotated successfully</p>
              <p style={{ fontSize: '11px', color: 'var(--amber)', lineHeight: 1.6 }}>
                Save the new credentials now. The signing secret is shown only once. Old keys expire in 1 hour.
              </p>
            </div>
          </div>

          <div>
            <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.375rem' }}>Key ID</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <code className="mono" style={{ flex: 1, fontSize: '13px', color: 'var(--peri)', background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.keyId}
              </code>
              <button
                onClick={() => copyToClipboard(result.keyId!, 'keyId')}
                className="btn btn--ghost btn--sm"
              >
                {copied === 'keyId' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.375rem' }}>Signing Secret</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <code className="mono" style={{ flex: 1, fontSize: '13px', color: 'var(--mint)', background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.signingSecret}
              </code>
              <button
                onClick={() => copyToClipboard(result.signingSecret!, 'secret')}
                className="btn btn--ghost btn--sm"
              >
                {copied === 'secret' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirming && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => !loading && setConfirming(false)}
          />
          <div className="card" style={{ position: 'relative', width: '100%', maxWidth: '28rem', margin: '0 1rem', overflow: 'hidden' }}>
            <div style={{ padding: '1.75rem' }}>
              <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '0.75rem', background: 'var(--amber-bg)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--amber)' }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </div>
              <h3 className="h3" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Rotate Service Key</h3>
              <p className="muted" style={{ fontSize: '13px', textAlign: 'center', lineHeight: 1.6 }}>
                This will generate a new signing secret and expire the current key in 1 hour. The agent will need to update its credentials.
              </p>
              {error && (
                <div style={{ marginTop: '1rem', borderRadius: '0.75rem', background: 'var(--rose-bg)', border: '1px solid var(--rose)', padding: '0.75rem 1rem', fontSize: '12px', color: 'var(--rose)' }}>
                  {error}
                </div>
              )}
            </div>
            <div style={{ padding: '0 1.75rem 1.75rem', display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="btn btn--ghost"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleRotate}
                disabled={loading}
                className="btn btn--ghost"
                style={{ flex: 1, color: 'var(--amber)', borderColor: 'var(--amber-bg)' }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '0.875rem', height: '0.875rem', border: '2px solid var(--amber)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Rotating…
                  </span>
                ) : (
                  'Confirm Rotate'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
