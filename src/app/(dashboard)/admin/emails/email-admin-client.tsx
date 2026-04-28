'use client';

import { useState } from 'react';
import { AlertTriangle, CheckSquare, FileText, KeyRound, Mail, ShieldCheck, UserPlus } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'welcome',
    label: 'Welcome',
    description: 'Sent when a new account is created',
    icon: Mail,
  },
  {
    id: 'password-reset',
    label: 'Password Reset',
    description: 'Sent when a user requests a password reset',
    icon: KeyRound,
  },
  {
    id: 'contract-invitation',
    label: 'Contract Invitation',
    description: 'Sent when an agent receives a contract proposal',
    icon: FileText,
  },
  {
    id: 'task-assigned',
    label: 'Task Assigned',
    description: 'Sent when a task is assigned to a user',
    icon: CheckSquare,
  },
  {
    id: 'approval-request',
    label: 'Approval Request',
    description: 'Sent when an action requires admin approval',
    icon: ShieldCheck,
  },
  {
    id: 'project-member-invitation',
    label: 'Project Invitation',
    description: 'Sent when an agent is invited to a project',
    icon: UserPlus,
  },
  {
    id: 'stale-blocker',
    label: 'Stale Blocker',
    description: 'Sent when a blocked task is automatically escalated',
    icon: AlertTriangle,
  },
];

interface EmailAdminClientProps {
  userEmail: string;
}

export default function EmailAdminClient({ userEmail }: EmailAdminClientProps) {
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem', alignItems: 'start' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          border: '1px solid var(--line-1)',
          borderRadius: 12,
          background: 'color-mix(in oklch, var(--bg-1) 72%, transparent)',
        }}
      >
        <p className="upper dim" style={{ fontSize: 10, padding: '4px 8px 8px', letterSpacing: '0.12em' }}>
          Templates
        </p>
        {TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          const selected = activeTemplate === tpl.id;

          return (
            <button
              key={tpl.id}
              type="button"
              style={{
                cursor: 'pointer',
                width: '100%',
                border: `1px solid ${selected ? 'color-mix(in oklch, var(--amber) 58%, var(--line-1))' : 'transparent'}`,
                background: selected ? 'color-mix(in oklch, var(--amber-bg) 46%, var(--bg-1))' : 'transparent',
                borderRadius: 9,
                padding: '9px 10px',
                display: 'grid',
                gridTemplateColumns: '30px 1fr',
                gap: 10,
                textAlign: 'left',
                alignItems: 'center',
                position: 'relative',
              }}
              onClick={() => setActiveTemplate(tpl.id)}
            >
              {selected && (
                <span
                  style={{
                    position: 'absolute',
                    left: -1,
                    top: 10,
                    bottom: 10,
                    width: 2,
                    borderRadius: 999,
                    background: 'var(--amber)',
                  }}
                />
              )}
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: 'grid',
                  placeItems: 'center',
                  color: selected ? 'var(--amber)' : 'var(--fg-3)',
                  background: selected ? 'color-mix(in oklch, var(--amber-bg) 70%, transparent)' : 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                }}
              >
                <Icon size={15} strokeWidth={1.8} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--fg-0)', lineHeight: 1.2 }}>
                  {tpl.label}
                </span>
                <span className="dim" style={{ display: 'block', fontSize: 11, marginTop: 3, lineHeight: 1.25 }}>
                  {tpl.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

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
              <div>
                <p className="muted" style={{ fontSize: '12px', fontWeight: 600 }}>
                  Preview — {TEMPLATES.find((t) => t.id === activeTemplate)?.label}
                </p>
                <p className="dim" style={{ fontSize: '10px', marginTop: 2 }}>
                  Uses preview-only payloads; test sends require explicit real props and remain disabled here for {userEmail}.
                </p>
              </div>
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
