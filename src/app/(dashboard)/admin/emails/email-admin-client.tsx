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
  {
    id: 'approval-request',
    label: 'Approval Request',
    description: 'Sent when an action requires admin approval',
    icon: '🔐',
  },
  {
    id: 'stale-blocker',
    label: 'Stale Blocker',
    description: 'Sent when a blocked task is automatically escalated',
    icon: '🚨',
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
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
      {/* Template list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p className="upper dim" style={{ fontSize: '10px', padding: '0 0.25rem', marginBottom: '0.75rem' }}>
          Templates
        </p>
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="card"
            style={{
              cursor: 'pointer',
              border: activeTemplate === tpl.id ? '1px solid var(--amber)' : '1px solid var(--line-1)',
              background: activeTemplate === tpl.id ? 'var(--amber-bg)' : 'var(--bg-1)',
            }}
            onClick={() => setActiveTemplate(tpl.id)}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{tpl.icon}</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-0)' }}>{tpl.label}</p>
                  <p className="dim" style={{ fontSize: '11px', marginTop: '0.125rem' }}>{tpl.description}</p>
                </div>
              </div>
              {activeTemplate === tpl.id && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    display: 'inline-block',
                    marginTop: '0.375rem',
                    flexShrink: 0,
                  }}
                />
              )}
            </div>

            {activeTemplate === tpl.id && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSendTest(tpl.id);
                  }}
                  disabled={sendingTest}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.5rem',
                    background: 'var(--amber-bg)',
                    border: '1px solid var(--amber)',
                    color: 'var(--amber)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: sendingTest ? 0.5 : 1,
                  }}
                >
                  {sendingTest ? (
                    <>
                      <span style={{ width: '0.75rem', height: '0.75rem', border: '1px solid var(--amber)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
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
                <span className="dim" style={{ fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {userEmail}</span>
              </div>
            )}
          </div>
        ))}

        {sendResult && (
          <div
            style={{
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              fontSize: '12px',
              fontWeight: 500,
              border: '1px solid',
              borderColor: sendResult.ok ? 'var(--mint)' : 'var(--rose)',
              background: sendResult.ok ? 'var(--mint-bg)' : 'var(--rose-bg)',
              color: sendResult.ok ? 'var(--mint)' : 'var(--rose)',
            }}
          >
            {sendResult.ok ? `✓ Test email sent to ${userEmail}` : `✗ ${sendResult.error}`}
          </div>
        )}
      </div>

      {/* Preview pane */}
      <div
        className="card"
        style={{
          overflow: 'hidden',
          border: '1px solid var(--line-1)',
          minHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        {activeTemplate ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-1)' }}>
              <p className="muted" style={{ fontSize: '12px', fontWeight: 600 }}>
                Preview — {TEMPLATES.find((t) => t.id === activeTemplate)?.label}
              </p>
              <a
                href={`/api/v1/email/preview?template=${activeTemplate}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--peri)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
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
              style={{ flex: 1, width: '100%', border: 'none', background: '#fff', minHeight: '560px' }}
              title={`Preview — ${activeTemplate}`}
            />
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '0.75rem',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.75rem',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-3)' }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <p className="muted" style={{ fontSize: '13px' }}>Select a template to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
