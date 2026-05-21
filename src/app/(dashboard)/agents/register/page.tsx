'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerAgent, type RegisterAgentResult } from './actions';

export default function RegisterAgentPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterAgentResult | null>(null);
  const [copied, setCopied] = useState<'keyId' | 'secret' | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const res = await registerAgent(formData);

      if (res.success) {
        setResult(res);
      } else {
        setError(res.error || 'Registration failed');
      }
    } catch {
      setError('An unexpected error occurred during registration');
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, field: 'keyId' | 'secret') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }

  if (result) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <Link
          href="/agents"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '12px', color: 'var(--fg-3)', marginBottom: '1.5rem', textDecoration: 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Agents
        </Link>

        <div style={{ maxWidth: '32rem', margin: '0 auto' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '1.75rem' }}>
              <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '0.75rem', background: 'var(--mint-bg)', border: '1px solid var(--mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--mint)' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 className="h2" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Agent Registered</h2>
              <p className="muted" style={{ fontSize: '13px', textAlign: 'center', marginBottom: '1.5rem' }}>
                Save these credentials now. The signing secret will <span style={{ color: 'var(--amber)', fontWeight: 600 }}>not be shown again</span>.
              </p>

              <div style={{ borderRadius: '0.75rem', background: 'var(--amber-bg)', border: '1px solid var(--amber)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', marginBottom: '0.25rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--amber)', flexShrink: 0, marginTop: '0.125rem' }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p style={{ fontSize: '11px', color: 'var(--amber)', lineHeight: 1.6 }}>
                    Copy both values below. The signing secret is displayed only once and cannot be recovered.
                  </p>
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
                    <code className="mono" style={{ flex: 1, fontSize: '13px', color: 'var(--mint)', background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'all' }}>
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

              <Link
                href="/agents"
                className="btn btn--ghost"
                style={{ marginTop: '1.5rem', display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', color: 'var(--peri)', borderColor: 'var(--peri-bg)' }}
              >
                Back to Agents
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <Link
        href="/agents"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '12px', color: 'var(--fg-3)', marginBottom: '1.5rem', textDecoration: 'none' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Agents
      </Link>

      <div style={{ marginBottom: '2rem' }}>
        <p className="upper" style={{ fontSize: '10px', color: 'var(--peri)', fontWeight: 600, marginBottom: '0.5rem' }}>Registry</p>
        <h1 className="h1">Register Agent</h1>
        <p className="muted" style={{ fontSize: '14px', marginTop: '0.25rem' }}>Create a new agent identity and service key</p>
      </div>

      <div style={{ maxWidth: '32rem' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <form onSubmit={handleSubmit} style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && (
              <div style={{ borderRadius: '0.75rem', background: 'var(--rose-bg)', border: '1px solid var(--rose)', padding: '0.75rem 1rem', fontSize: '12px', color: 'var(--rose)' }}>
                {error}
              </div>
            )}

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Name <span style={{ color: 'var(--rose)' }}>*</span>
              </label>
              <input
                name="name"
                required
                pattern="^[a-z0-9][a-z0-9_-]*$"
                placeholder="my-agent"
                className="cp-input mono"
                style={{ width: '100%' }}
              />
              <p className="dim" style={{ fontSize: '10px', marginTop: '0.375rem' }}>Slug format: lowercase, numbers, hyphens, underscores</p>
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Display Name <span style={{ color: 'var(--rose)' }}>*</span>
              </label>
              <input
                name="display_name"
                required
                placeholder="My Agent"
                className="cp-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Owner <span style={{ color: 'var(--rose)' }}>*</span>
              </label>
              <input
                name="owner"
                required
                placeholder="your-name"
                className="cp-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Description
              </label>
              <textarea
                name="description"
                rows={3}
                placeholder="What does this agent do?"
                className="cp-input"
                style={{ width: '100%', resize: 'none' }}
              />
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Capabilities
              </label>
              <input
                name="capabilities"
                placeholder="trading, research, messaging"
                className="cp-input"
                style={{ width: '100%' }}
              />
              <p className="dim" style={{ fontSize: '10px', marginTop: '0.375rem' }}>Comma-separated list</p>
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Protocols
              </label>
              <input
                name="protocols"
                placeholder="a2a-comms/v1, webhooks"
                className="cp-input"
                style={{ width: '100%' }}
              />
              <p className="dim" style={{ fontSize: '10px', marginTop: '0.375rem' }}>Comma-separated list</p>
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Max Active Contracts
              </label>
              <input
                name="max_concurrent_contracts"
                type="number"
                defaultValue={5}
                min={1}
                max={100}
                className="cp-input mono"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Trust Tier
              </label>
              <select
                name="trust_tier"
                defaultValue="external"
                className="cp-select"
                style={{ width: '100%' }}
              >
                <option value="internal">Internal — full project + handoff access</option>
                <option value="partner">Partner — can observe and broker, but not take handoffs</option>
                <option value="external">External — registry only until explicitly trusted</option>
              </select>
              <p className="dim" style={{ fontSize: '10px', marginTop: '0.375rem' }}>This is the base trust rail. Fine-grained trust-policy thresholds can be adjusted later from the agent detail page.</p>
            </div>

            <div>
              <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
                Trust Notes
              </label>
              <textarea
                name="trust_notes"
                rows={2}
                placeholder="Why this agent has this tier, who vetted it, or what restrictions apply"
                className="cp-input"
                style={{ width: '100%', resize: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn--primary"
              style={{ width: '100%' }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '1rem', height: '1rem', border: '2px solid var(--peri)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Registering…
                </span>
              ) : (
                'Register Agent'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
