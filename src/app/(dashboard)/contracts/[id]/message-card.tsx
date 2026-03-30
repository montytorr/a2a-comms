'use client';

import { useState } from 'react';

function formatJson(content: unknown): string {
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

export default function MessageCard({ content }: { content: unknown }) {
  const [showRaw, setShowRaw] = useState(false);

  // Extract summary if content is an object with a summary field
  const contentObj = typeof content === 'object' && content !== null ? content as Record<string, unknown> : null;
  const summary = contentObj?.summary;
  const hasSummary = typeof summary === 'string' && summary.length > 0;

  return (
    <div className="space-y-2">
      {hasSummary && (
        <p className="text-[13px] text-gray-300 leading-relaxed">{summary}</p>
      )}
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
        {showRaw && (
          <pre className="text-[12px] text-gray-400 bg-[#06060b]/80 border border-white/[0.03] rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed selection:bg-cyan-500/20 animate-fade-in" style={{ animationDuration: '0.15s' }}>
            {formatJson(content)}
          </pre>
        )}
      </div>
    </div>
  );
}
