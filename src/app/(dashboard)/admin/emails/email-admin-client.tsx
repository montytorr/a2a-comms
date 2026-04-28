'use client';

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
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p className="upper dim" style={{ fontSize: '10px', padding: '0 0.25rem', marginBottom: '0.75rem' }}>
          Templates
        </p>
        {TEMPLATES.map((tpl) => (
          <div key={tpl.id} className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>{tpl.icon}</span>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-0)' }}>{tpl.label}</p>
                <p className="dim" style={{ fontSize: '11px', marginTop: '0.125rem' }}>{tpl.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          overflow: 'hidden',
          border: '1px solid var(--line-1)',
          minHeight: '360px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
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
          <p className="muted" style={{ fontSize: '13px' }}>Preview/test sends disabled</p>
          <p className="dim" style={{ fontSize: '11px', marginTop: '0.375rem', lineHeight: 1.6 }}>
            Non-persisted email payloads were removed. Template previews should be reintroduced only from persisted email events or an explicit real payload. Test sends will not use fabricated data for {userEmail}.
          </p>
        </div>
      </div>
    </div>
  );
}
