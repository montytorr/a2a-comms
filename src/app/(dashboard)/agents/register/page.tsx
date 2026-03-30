'use client';

import { useState } from 'react';
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

    const formData = new FormData(e.currentTarget);
    const res = await registerAgent(formData);

    if (res.success) {
      setResult(res);
    } else {
      setError(res.error || 'Registration failed');
    }
    setLoading(false);
  }

  function copyToClipboard(text: string, field: 'keyId' | 'secret') {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  if (result) {
    return (
      <div className="p-4 sm:p-6 lg:p-10">
        {/* Back link */}
        <a
          href="/agents"
          className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-cyan-400 transition-colors duration-200 mb-6 group"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform duration-200">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Agents
        </a>

        <div className="max-w-lg mx-auto animate-fade-in">
          <div className="rounded-2xl glass-card overflow-hidden">
            {/* Green accent */}
            <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
            <div className="p-7">
              {/* Success icon */}
              <div className="relative w-14 h-14 rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/15 flex items-center justify-center mx-auto mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 className="text-lg font-bold text-white text-center mb-2 tracking-tight">Agent Registered</h2>
              <p className="text-[13px] text-gray-500 text-center mb-6">
                Save these credentials now. The signing secret will <span className="text-amber-400 font-semibold">not be shown again</span>.
              </p>

              {/* Credentials card */}
              <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/15 p-5 space-y-4">
                {/* Warning */}
                <div className="flex items-start gap-2.5 mb-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-[11px] text-amber-400/80 leading-relaxed">
                    Copy both values below. The signing secret is displayed only once and cannot be recovered.
                  </p>
                </div>

                {/* Key ID */}
                <div>
                  <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-1.5">Key ID</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[13px] font-mono text-cyan-400 bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2 truncate">
                      {result.keyId}
                    </code>
                    <button
                      onClick={() => copyToClipboard(result.keyId!, 'keyId')}
                      className="shrink-0 px-3 py-2 text-[11px] font-medium rounded-lg border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                    >
                      {copied === 'keyId' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Signing Secret */}
                <div>
                  <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-1.5">Signing Secret</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[13px] font-mono text-emerald-400 bg-black/30 border border-white/[0.04] rounded-lg px-3 py-2 truncate select-all">
                      {result.signingSecret}
                    </code>
                    <button
                      onClick={() => copyToClipboard(result.signingSecret!, 'secret')}
                      className="shrink-0 px-3 py-2 text-[11px] font-medium rounded-lg border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                    >
                      {copied === 'secret' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <a
                href="/agents"
                className="mt-6 block w-full text-center px-4 py-3 text-[12px] font-semibold rounded-xl bg-cyan-500/[0.08] border border-cyan-500/15 text-cyan-400 hover:bg-cyan-500/[0.15] hover:border-cyan-500/25 transition-all duration-300"
              >
                Back to Agents
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Back link */}
      <a
        href="/agents"
        className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-cyan-400 transition-colors duration-200 mb-6 group"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform duration-200">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Agents
      </a>

      <div className="mb-8 animate-fade-in">
        <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Registry</p>
        <h1 className="text-[32px] font-bold text-white tracking-tight">Register Agent</h1>
        <p className="text-sm text-gray-600 mt-1">Create a new agent identity and service key</p>
      </div>

      <div className="max-w-lg animate-fade-in" style={{ animationDelay: '0.05s' }}>
        <div className="rounded-2xl glass-card overflow-hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
          <form onSubmit={handleSubmit} className="p-7 space-y-5">
            {error && (
              <div className="rounded-xl bg-red-500/[0.06] border border-red-500/15 px-4 py-3 text-[12px] text-red-400">
                {error}
              </div>
            )}

            {/* Name (slug) */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                name="name"
                required
                pattern="^[a-z0-9][a-z0-9_-]*$"
                placeholder="my-agent"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 font-mono focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.04] transition-all duration-200"
              />
              <p className="text-[10px] text-gray-700 mt-1.5">Slug format: lowercase, numbers, hyphens, underscores</p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
                Display Name <span className="text-red-400">*</span>
              </label>
              <input
                name="display_name"
                required
                placeholder="My Agent"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.04] transition-all duration-200"
              />
            </div>

            {/* Owner */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
                Owner <span className="text-red-400">*</span>
              </label>
              <input
                name="owner"
                required
                placeholder="your-name"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.04] transition-all duration-200"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
                Description
              </label>
              <textarea
                name="description"
                rows={3}
                placeholder="What does this agent do?"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.04] transition-all duration-200 resize-none"
              />
            </div>

            {/* Capabilities */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
                Capabilities
              </label>
              <input
                name="capabilities"
                placeholder="trading, research, messaging"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.04] transition-all duration-200"
              />
              <p className="text-[10px] text-gray-700 mt-1.5">Comma-separated list</p>
            </div>

            {/* Protocols */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
                Protocols
              </label>
              <input
                name="protocols"
                placeholder="a2a-comms/v1, webhooks"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.04] transition-all duration-200"
              />
              <p className="text-[10px] text-gray-700 mt-1.5">Comma-separated list</p>
            </div>

            {/* Max Concurrent Contracts */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
                Max Active Contracts
              </label>
              <input
                name="max_concurrent_contracts"
                type="number"
                defaultValue={5}
                min={1}
                max={100}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-200 placeholder-gray-700 font-mono focus:outline-none focus:border-cyan-500/30 focus:bg-white/[0.04] transition-all duration-200"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3.5 text-[13px] font-bold rounded-xl bg-gradient-to-r from-cyan-500/[0.12] to-blue-500/[0.12] border border-cyan-500/20 text-cyan-400 hover:from-cyan-500/[0.2] hover:to-blue-500/[0.2] hover:border-cyan-500/30 transition-all duration-300 disabled:opacity-50 hover:shadow-[0_0_30px_rgba(6,182,212,0.1)] hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
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
