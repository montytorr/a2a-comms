'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registerWebhook, getAgents } from './actions';

import { CANONICAL_WEBHOOK_EVENTS } from '@/lib/webhook-events';

const ALL_EVENTS = CANONICAL_WEBHOOK_EVENTS;

export default function RegisterWebhookPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<{ id: string; name: string; display_name: string }[]>([]);
  const [agentId, setAgentId] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>([...ALL_EVENTS]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getAgents().then(setAgents);
  }, []);

  function toggleEvent(ev: string) {
    setEvents(prev =>
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    );
  }

  function generateSecret() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = 'whsec_';
    for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setSecret(s);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!agentId || !url || !secret || events.length === 0) {
      setError('All fields are required and at least one event must be selected.');
      return;
    }
    setLoading(true);
    try {
      const result = await registerWebhook({ agentId, url, secret, events });
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => router.push('/webhooks'), 1500);
      }
    } catch {
      setError('Failed to register webhook');
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="animate-fade-in" style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '4rem',
              height: '4rem',
              borderRadius: '1rem',
              background: 'var(--mint-bg)',
              border: '1px solid var(--mint)',
              marginBottom: '1rem',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--mint)' }} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--fg-0)', marginBottom: '0.5rem' }}>Webhook Registered</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--fg-3)' }}>Redirecting to webhooks…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '42rem' }} className="sm:p-6 lg:p-10">
      {/* Back */}
      <a
        href="/webhooks"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '12px',
          color: 'var(--fg-3)',
          textDecoration: 'none',
          marginBottom: '1.5rem',
          transition: 'color 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Webhooks
      </a>

      <div className="animate-fade-in" style={{ marginBottom: '2rem' }}>
        <p className="upper" style={{ fontSize: '10px', fontWeight: 600, color: 'var(--peri)', marginBottom: '0.5rem' }}>Register</p>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--fg-0)', letterSpacing: '-0.02em' }}>New Webhook</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--fg-3)', marginTop: '0.25rem' }}>Register a push notification endpoint for an agent</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="animate-fade-in"
        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animationDelay: '0.05s' }}
      >
        {error && (
          <div
            style={{
              borderRadius: '0.75rem',
              background: 'var(--rose-bg)',
              border: '1px solid var(--rose)',
              padding: '0.75rem 1rem',
              fontSize: '13px',
              color: 'var(--rose)',
            }}
          >
            {error}
          </div>
        )}

        {/* Agent */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>Agent</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="cp-select"
            style={{ width: '100%' }}
          >
            <option value="">Select an agent…</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.display_name} ({a.name})</option>
            ))}
          </select>
        </div>

        {/* URL */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>Webhook URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-server.com/a2a-webhook"
            className="cp-input mono"
            style={{ width: '100%' }}
          />
        </div>

        {/* Secret */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>Signing Secret</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="whsec_..."
              className="cp-input mono"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={generateSecret}
              className="btn btn--peri"
              style={{ padding: '0.75rem 1rem', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}
            >
              Generate
            </button>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--fg-3)', marginTop: '0.5rem' }}>Used to sign webhook payloads (HMAC-SHA256). Store securely — shown here once.</p>
        </div>

        {/* Events */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.75rem' }}>Events</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {ALL_EVENTS.map(ev => (
              <button
                key={ev}
                type="button"
                onClick={() => toggleEvent(ev)}
                style={{
                  padding: '0.375rem 0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: `1px solid ${events.includes(ev) ? 'var(--peri)' : 'var(--line-1)'}`,
                  background: events.includes(ev) ? 'var(--peri-bg)' : 'var(--bg-1)',
                  color: events.includes(ev) ? 'var(--peri)' : 'var(--fg-3)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {events.includes(ev) && '✓ '}{ev}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="btn btn--peri"
          style={{
            width: '100%',
            padding: '0.875rem 1.5rem',
            fontSize: '13px',
            fontWeight: 700,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '1rem',
                  height: '1rem',
                  borderRadius: '50%',
                  border: '2px solid var(--peri)',
                  borderTopColor: 'transparent',
                  animation: 'spin 0.6s linear infinite',
                  display: 'inline-block',
                }}
              />
              Registering…
            </span>
          ) : (
            'Register Webhook'
          )}
        </button>
      </form>
    </div>
  );
}
