'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registerWebhook, getAgents } from './actions';

const ALL_EVENTS = [
  'invitation',
  'message',
  'contract_state',
  'approval.requested',
  'approval.approved',
  'approval.denied',
] as const;

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
      <div className="p-4 sm:p-6 lg:p-10 flex items-center justify-center min-h-[60vh]">
        <div className="text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/[0.1] border border-emerald-500/20 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Webhook Registered</h2>
          <p className="text-sm text-gray-500">Redirecting to webhooks…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-2xl">
      {/* Back */}
      <a href="/webhooks" className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-cyan-400 transition-colors duration-200 mb-6 group">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform duration-200">
          <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Webhooks
      </a>

      <div className="mb-8 animate-fade-in">
        <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Register</p>
        <h1 className="text-[32px] font-bold text-white tracking-tight">New Webhook</h1>
        <p className="text-sm text-gray-600 mt-1">Register a push notification endpoint for an agent</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in" style={{ animationDelay: '0.05s' }}>
        {error && (
          <div className="rounded-xl bg-red-500/[0.08] border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Agent */}
        <div className="rounded-2xl glass-card p-6">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2">Agent</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full bg-[#0a0a10] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          >
            <option value="">Select an agent…</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.display_name} ({a.name})</option>
            ))}
          </select>
        </div>

        {/* URL */}
        <div className="rounded-2xl glass-card p-6">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2">Webhook URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-server.com/a2a-webhook"
            className="w-full bg-[#0a0a10] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
          />
        </div>

        {/* Secret */}
        <div className="rounded-2xl glass-card p-6">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2">Signing Secret</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="whsec_..."
              className="flex-1 bg-[#0a0a10] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
            />
            <button
              type="button"
              onClick={generateSecret}
              className="px-4 py-3 rounded-xl text-[11px] font-semibold text-cyan-400 bg-cyan-500/[0.08] border border-cyan-500/15 hover:bg-cyan-500/[0.12] transition-all shrink-0"
            >
              Generate
            </button>
          </div>
          <p className="text-[10px] text-gray-700 mt-2">Used to sign webhook payloads (HMAC-SHA256). Store securely — shown here once.</p>
        </div>

        {/* Events */}
        <div className="rounded-2xl glass-card p-6">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-3">Events</label>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map(ev => (
              <button
                key={ev}
                type="button"
                onClick={() => toggleEvent(ev)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 border ${
                  events.includes(ev)
                    ? 'text-cyan-400 bg-cyan-500/[0.1] border-cyan-500/20'
                    : 'text-gray-600 bg-white/[0.02] border-white/[0.04] hover:text-gray-400'
                }`}
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
          className="w-full px-6 py-3.5 rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 rounded-full border-white/30 border-t-white animate-spin" />
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
