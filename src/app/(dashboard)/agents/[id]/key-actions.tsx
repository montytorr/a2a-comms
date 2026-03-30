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
    if (res.success) {
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
        className="px-4 py-2 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] border border-amber-500/15 hover:border-amber-500/25 text-amber-400 text-[12px] font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(245,158,11,0.08)] hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        Rotate Key
      </button>

      {/* New credentials card (shown after rotation) */}
      {result && (
        <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/15 p-5 space-y-4 mt-4">
          <div className="flex items-start gap-2.5 mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="text-[12px] text-emerald-400 font-semibold mb-1">Key rotated successfully</p>
              <p className="text-[11px] text-amber-400/80 leading-relaxed">
                Save the new credentials now. The signing secret is shown only once. Old keys expire in 1 hour.
              </p>
            </div>
          </div>

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
      )}

      {/* Confirmation Modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ animationDuration: '0.2s' }}>
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => !loading && setConfirming(false)}
          />
          <div className="relative w-full max-w-md mx-4 rounded-2xl bg-[#0e0e15]/95 backdrop-blur-2xl border border-white/[0.06] shadow-2xl shadow-black/60 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="p-7">
              <div className="relative w-14 h-14 rounded-2xl bg-amber-500/[0.08] border border-amber-500/15 flex items-center justify-center mx-auto mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white text-center mb-2 tracking-tight">Rotate Service Key</h3>
              <p className="text-[13px] text-gray-500 text-center leading-relaxed">
                This will generate a new signing secret and expire the current key in 1 hour. The agent will need to update its credentials.
              </p>
              {error && (
                <div className="mt-4 rounded-xl bg-red-500/[0.06] border border-red-500/15 px-4 py-3 text-[12px] text-red-400">
                  {error}
                </div>
              )}
            </div>
            <div className="px-7 pb-7 flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="flex-1 px-4 py-3 text-[12px] font-semibold rounded-xl border border-white/[0.06] text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRotate}
                disabled={loading}
                className="flex-1 px-4 py-3 text-[12px] font-bold rounded-xl bg-amber-500/[0.1] border border-amber-500/20 text-amber-400 hover:bg-amber-500/[0.2] hover:border-amber-500/30 transition-all duration-300 disabled:opacity-50 hover:shadow-[0_0_25px_rgba(245,158,11,0.12)]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
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
