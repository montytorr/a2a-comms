'use client';

import { useState, useTransition } from 'react';
import { updateNotificationPreferences, type NotificationPreferences } from './actions';

interface NotificationSettingsClientProps {
  initialPrefs: NotificationPreferences;
}

interface ToggleItem {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  disabled?: boolean;
  alwaysOn?: boolean;
}

const toggleItems: ToggleItem[] = [
  {
    key: 'welcome',
    label: 'Welcome Emails',
    description: 'Receive a welcome email when your account is created.',
  },
  {
    key: 'contract_invitation',
    label: 'Contract Invitations',
    description: 'Get notified when an agent proposes a new contract.',
  },
  {
    key: 'task_assigned',
    label: 'Task Assignments',
    description: 'Get notified when a task is assigned to you.',
  },
  {
    key: 'approval_request',
    label: 'Approval Requests',
    description: 'Get notified when an action requires your approval.',
  },
  {
    key: 'project_member_invitation',
    label: 'Project Member Invitations',
    description: 'Get notified when one of your agents is invited to a project.',
  },
  {
    key: 'stale_blocker',
    label: 'Stale Blockers',
    description: 'Get notified when a blocked task crosses the stale escalation threshold.',
  },
];

export default function NotificationSettingsClient({ initialPrefs }: NotificationSettingsClientProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(initialPrefs);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function handleToggle(key: keyof NotificationPreferences) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setFeedback(null);

    startTransition(async () => {
      const result = await updateNotificationPreferences(updated);
      if (result.success) {
        setFeedback({ type: 'success', message: 'Preferences saved.' });
      } else {
        setPrefs(prefs);
        setFeedback({ type: 'error', message: result.error || 'Failed to save preferences.' });
      }
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  return (
    <div style={{ padding: '28px 32px 60px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="h1">Settings</h1>
        <p className="muted" style={{ fontSize: '13px', marginTop: '4px' }}>Manage your notification preferences.</p>
      </div>

      <div style={{ maxWidth: '560px' }}>
        <div className="card">
          {/* Section header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-1)' }}>
            <h2 className="h3">Email Notifications</h2>
            <p className="dim" style={{ fontSize: '11px', marginTop: '2px' }}>Choose which emails you&apos;d like to receive.</p>
          </div>

          {/* Password Reset — always on */}
          <div
            className="row"
            style={{ justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--line-1)' }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingRight: '16px' }}>
              <p className="muted" style={{ fontSize: '13px', fontWeight: 500 }}>Password Reset</p>
              <p className="dim" style={{ fontSize: '11px', marginTop: '2px' }}>Security emails are always sent and cannot be disabled.</p>
            </div>
            <Toggle enabled={true} disabled={true} onChange={() => {}} />
          </div>

          {/* Configurable toggles */}
          {toggleItems.map((item, idx) => (
            <div
              key={item.key}
              className="row"
              style={{
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: idx < toggleItems.length - 1 ? '1px solid var(--line-1)' : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, paddingRight: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-0)' }}>{item.label}</p>
                <p className="dim" style={{ fontSize: '11px', marginTop: '2px' }}>{item.description}</p>
              </div>
              <Toggle
                enabled={prefs[item.key]}
                disabled={isPending}
                onChange={() => handleToggle(item.key)}
              />
            </div>
          ))}
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'all 0.2s',
              background: feedback.type === 'success' ? 'var(--mint-bg)' : 'var(--rose-bg)',
              color: feedback.type === 'success' ? 'var(--mint)' : 'var(--rose)',
              border: `1px solid ${feedback.type === 'success' ? 'oklch(0.50 0.10 165 / 0.35)' : 'oklch(0.55 0.10 25 / 0.4)'}`,
            }}
          >
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        border: 'none',
        cursor: disabled ? (enabled ? 'not-allowed' : 'wait') : 'pointer',
        opacity: disabled && !enabled ? 0.5 : disabled ? 0.6 : 1,
        background: enabled
          ? 'oklch(0.50 0.10 165 / 0.5)'
          : 'var(--bg-3)',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          transition: 'transform 0.2s, background 0.2s',
          transform: enabled ? 'translateX(19px)' : 'translateX(3px)',
          background: enabled ? 'var(--mint)' : 'var(--fg-4)',
        }}
      />
    </button>
  );
}
