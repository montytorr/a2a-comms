'use client';

import { useState } from 'react';
import { testWebhook, type WebhookTestResult } from './actions';

interface WebhookCardProps {
  webhook: {
    id: string;
    url: string;
    events: string[];
    is_active: boolean;
    failure_count: number;
    created_at: string;
    updated_at: string;
    last_delivery_at: string | null;
  };
  animationDelay: string;
}

function truncateUrl(url: string, max = 60): string {
  if (url.length <= max) return url;
  return url.slice(0, max) + '…';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

export default function WebhookCard({ webhook: wh, animationDelay }: WebhookCardProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testWebhook(wh.id);
    setTestResult(result);
    setTesting(false);
  }

  return (
    <div
      className="rounded-2xl glass-card overflow-hidden animate-fade-in"
      style={{ animationDelay }}
    >
      {/* Top accent line */}
      <div className={`h-px bg-gradient-to-r from-transparent ${wh.is_active ? 'via-cyan-500/30' : 'via-gray-600/20'} to-transparent`} />

      <div className="p-5">
        {/* URL + Status row */}
        <div className="flex items-start gap-3 mb-4">
          {/* Status indicator */}
          <div className="mt-1.5 shrink-0 relative">
            <div className={`w-2 h-2 rounded-full ${wh.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {wh.is_active && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-mono text-gray-300 truncate" title={wh.url}>
              {truncateUrl(wh.url, 60)}
            </p>
            <p className="text-[10px] text-gray-700 mt-0.5">
              {wh.is_active ? 'Active' : 'Inactive'}
              {wh.failure_count > 0 && (
                <span className="text-amber-500 ml-2">
                  · {wh.failure_count} failure{wh.failure_count !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          {/* Test button */}
          <button
            onClick={handleTest}
            disabled={testing}
            className="shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-white/[0.08] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 hover:bg-cyan-500/[0.06] transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5"
          >
            {testing ? (
              <>
                <span className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
                Test
              </>
            )}
          </button>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`mb-4 rounded-lg px-3 py-2.5 flex items-center gap-2 text-[11px] font-medium ${
            testResult.success
              ? 'bg-emerald-500/[0.06] border border-emerald-500/15 text-emerald-400'
              : 'bg-red-500/[0.06] border border-red-500/15 text-red-400'
          }`}>
            {testResult.success ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            <span>
              {testResult.success
                ? `OK — ${testResult.status} ${testResult.statusText}`
                : testResult.error
                  ? `Failed — ${testResult.error}`
                  : `Failed — ${testResult.status} ${testResult.statusText}`}
            </span>
            {testResult.responseTime !== undefined && (
              <span className="text-gray-600 ml-auto font-mono tabular-nums">{testResult.responseTime}ms</span>
            )}
          </div>
        )}

        {/* Event badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {wh.events.map((event) => (
            <span
              key={event}
              className="text-[10px] font-mono font-medium text-cyan-400 bg-cyan-500/[0.08] border border-cyan-500/[0.12] px-2 py-0.5 rounded-full"
            >
              {event}
            </span>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 pt-3 border-t border-white/[0.04]">
          <div>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Last Delivery</p>
            <span className="text-[12px] text-gray-400 font-mono tabular-nums">
              {wh.last_delivery_at ? timeAgo(wh.last_delivery_at) : 'Never'}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Created</p>
            <span className="text-[12px] text-gray-400 font-mono tabular-nums">
              {formatDate(wh.created_at)}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Updated</p>
            <span className="text-[12px] text-gray-400 font-mono tabular-nums">
              {formatDate(wh.updated_at)}
            </span>
          </div>
          {wh.failure_count > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Failures</p>
              <span className="text-[12px] text-amber-400 font-mono font-semibold tabular-nums">
                {wh.failure_count}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
