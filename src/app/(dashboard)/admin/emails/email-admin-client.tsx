'use client';

import { useState } from 'react';

const TEMPLATES = [
  {
    id: 'welcome',
    label: 'Welcome',
    description: 'Sent when a new account is created',
    icon: '👋',
  },
  {
    id: 'password-reset',
    label: 'Password Reset',
    description: 'Sent when a user requests a password reset',
    icon: '🔑',
  },
  {
    id: 'contract-invitation',
    label: 'Contract Invitation',
    description: 'Sent when an agent receives a contract proposal',
    icon: '📄',
  },
  {
    id: 'task-assigned',
    label: 'Task Assigned',
    description: 'Sent when a task is assigned to a user',
    icon: '✅',
  },
];

interface EmailAdminClientProps {
  userEmail: string;
}

export default function EmailAdminClient({ userEmail }: EmailAdminClientProps) {
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  async function handleSendTest(templateId: string) {
    setSendingTest(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/v1/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateId, to: userEmail, props: {} }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendResult({ error: json.error || 'Send failed' });
      } else {
        setSendResult({ ok: true });
      }
    } catch (err) {
      setSendResult({ error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSendingTest(false);
      setTimeout(() => setSendResult(null), 4000);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-6">
      {/* Template list */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em] px-1 mb-3">
          Templates
        </p>
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className={`glass-card rounded-xl p-4 cursor-pointer transition-all duration-200 border ${
              activeTemplate === tpl.id
                ? 'border-amber-500/30 bg-amber-500/[0.04]'
                : 'border-white/[0.04] hover:border-white/[0.08]'
            }`}
            onClick={() => setActiveTemplate(tpl.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{tpl.icon}</span>
                <div>
                  <p className="text-[13px] font-semibold text-white">{tpl.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{tpl.description}</p>
                </div>
              </div>
              {activeTemplate === tpl.id && (
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              )}
            </div>

            {activeTemplate === tpl.id && (
              <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSendTest(tpl.id);
                  }}
                  disabled={sendingTest}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-semibold hover:bg-amber-500/15 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingTest ? (
                    <>
                      <span className="w-3 h-3 border border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      Send Test
                    </>
                  )}
                </button>
                <span className="text-[10px] text-gray-600 truncate">→ {userEmail}</span>
              </div>
            )}
          </div>
        ))}

        {sendResult && (
          <div
            className={`rounded-xl px-4 py-3 text-[12px] font-medium border ${
              sendResult.ok
                ? 'bg-emerald-500/[0.06] border-emerald-500/15 text-emerald-400'
                : 'bg-red-500/[0.06] border-red-500/15 text-red-400'
            }`}
          >
            {sendResult.ok ? `✓ Test email sent to ${userEmail}` : `✗ ${sendResult.error}`}
          </div>
        )}
      </div>

      {/* Preview pane */}
      <div className="glass-card rounded-xl overflow-hidden border border-white/[0.04] min-h-[600px] flex flex-col">
        {activeTemplate ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]">
              <p className="text-[12px] font-semibold text-gray-400">
                Preview — {TEMPLATES.find((t) => t.id === activeTemplate)?.label}
              </p>
              <a
                href={`/api/v1/email/preview?template=${activeTemplate}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-cyan-500 hover:text-cyan-400 transition-colors flex items-center gap-1"
              >
                Open in new tab
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
            <iframe
              key={activeTemplate}
              src={`/api/v1/email/preview?template=${activeTemplate}`}
              className="flex-1 w-full border-0 bg-white"
              title={`Preview — ${activeTemplate}`}
              style={{ minHeight: '560px' }}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <p className="text-[13px] text-gray-500">Select a template to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
