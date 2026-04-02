'use client';

import { useState } from 'react';

// ── Syntax-highlighted JSON ──

function SyntaxJson({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  // Tokenize: strings, keys, numbers, booleans, null
  const parts = json.split(/("(?:[^"\\]|\\.)*")/g);

  return (
    <pre className="text-[12px] bg-[#06060b]/80 border border-white/[0.03] rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed selection:bg-cyan-500/20 animate-fade-in" style={{ animationDuration: '0.15s' }}>
      {parts.map((part, i) => {
        // Quoted strings
        if (part.startsWith('"') && part.endsWith('"')) {
          // Check if this is a key (followed by colon in the next part)
          const next = parts[i + 1];
          if (next && next.trimStart().startsWith(':')) {
            return <span key={i} className="text-cyan-400">{part}</span>;
          }
          return <span key={i} className="text-emerald-400">{part}</span>;
        }
        // Numbers, booleans, null within non-string parts
        return (
          <span key={i}>
            {part.split(/(\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g).map((sub, j) => {
              if (/^(true|false)$/.test(sub)) return <span key={j} className="text-amber-400">{sub}</span>;
              if (sub === 'null') return <span key={j} className="text-gray-600">{sub}</span>;
              if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(sub)) return <span key={j} className="text-violet-400">{sub}</span>;
              return <span key={j} className="text-gray-500">{sub}</span>;
            })}
          </span>
        );
      })}
    </pre>
  );
}

// ── Inline field preview ──

/** Keys to always skip in the preview (shown elsewhere or not useful) */
const SKIP_KEYS = new Set(['from', 'type', 'summary']);

/** Keys to show first in the preview, in this order */
const PRIORITY_KEYS = ['status', 'action', 'message', 'result', 'reason', 'error', 'title', 'description'];

function InlinePreview({ content }: { content: Record<string, unknown> }) {
  // Collect fields to show
  const entries: [string, unknown][] = [];
  const seen = new Set<string>();

  // Priority keys first
  for (const key of PRIORITY_KEYS) {
    if (key in content && !SKIP_KEYS.has(key)) {
      entries.push([key, content[key]]);
      seen.add(key);
    }
  }

  // Then remaining keys (up to 6 total)
  for (const [key, value] of Object.entries(content)) {
    if (entries.length >= 6) break;
    if (seen.has(key) || SKIP_KEYS.has(key)) continue;
    // Skip nested objects/arrays in preview
    if (typeof value === 'object' && value !== null) continue;
    entries.push([key, value]);
    seen.add(key);
  }

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{key}</span>
          <span className="text-[12px] text-gray-300 font-mono truncate max-w-[200px]">
            {formatValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    return value.length > 60 ? value.slice(0, 57) + '…' : value;
  }
  return JSON.stringify(value);
}

// ── Main component ──

export default function MessageCard({ content }: { content: unknown }) {
  const [showRaw, setShowRaw] = useState(false);

  const contentObj = typeof content === 'object' && content !== null ? content as Record<string, unknown> : null;
  const summary = contentObj?.summary;
  const hasSummary = typeof summary === 'string' && summary.length > 0;
  const messageType = typeof contentObj?.type === 'string' ? contentObj.type : null;
  const sender = typeof contentObj?.from === 'string' ? contentObj.from : null;

  return (
    <div className="space-y-2">
      {/* Type + From badges */}
      {(messageType || sender) && (
        <div className="flex items-center gap-2 mb-1">
          {messageType && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan-500/70 bg-cyan-500/[0.06] border border-cyan-500/[0.08] px-2 py-0.5 rounded-md">
              {String(messageType)}
            </span>
          )}
          {sender && (
            <span className="text-[9px] font-semibold text-gray-600">
              from <span className="text-gray-400">{String(sender)}</span>
            </span>
          )}
        </div>
      )}

      {/* Summary */}
      {hasSummary && (
        <p className="text-[13px] text-gray-300 leading-relaxed">{summary}</p>
      )}

      {/* Inline field preview */}
      {contentObj && <InlinePreview content={contentObj} />}

      {/* Raw JSON toggle */}
      <div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 hover:text-gray-400 transition-colors duration-200 uppercase tracking-wider mb-1.5"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${showRaw ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {showRaw ? 'Hide' : 'Show'} raw JSON
        </button>
        {showRaw && <SyntaxJson data={content} />}
      </div>
    </div>
  );
}
