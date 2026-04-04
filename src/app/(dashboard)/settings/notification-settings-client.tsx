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
        // Revert on error
        setPrefs(prefs);
        setFeedback({ type: 'error', message: result.error || 'Failed to save preferences.' });
      }
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your notification preferences.</p>
      </div>

      <div className="max-w-2xl">
        <div className="rounded-2xl border border-white/[0.06] bg-[#0d0d14] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.04]">
            <h2 className="text-sm font-semibold text-white">Email Notifications</h2>
            <p className="text-xs text-gray-500 mt-0.5">Choose which emails you&apos;d like to receive.</p>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {/* Password Reset — always on */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[13px] font-medium text-gray-400">Password Reset</p>
                <p className="text-[11px] text-gray-600 mt-0.5">Security emails are always sent and cannot be disabled.</p>
              </div>
              <div className="relative">
                <button
                  disabled
                  className="relative inline-flex h-5 w-9 items-center rounded-full bg-cyan-500/30 cursor-not-allowed opacity-60"
                >
                  <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-cyan-400 transition-transform translate-x-4" />
                </button>
              </div>
            </div>

            {/* Configurable toggles */}
            {toggleItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between px-6 py-4">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-[13px] font-medium text-white">{item.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.description}</p>
                </div>
                <div className="relative">
                  <button
                    onClick={() => handleToggle(item.key)}
                    disabled={isPending}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                      prefs[item.key]
                        ? 'bg-cyan-500/30'
                        : 'bg-white/[0.06]'
                    } ${isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full transition-all duration-200 ${
                        prefs[item.key]
                          ? 'translate-x-4 bg-cyan-400'
                          : 'translate-x-0.5 bg-gray-600'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div
            className={`mt-4 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/[0.08] text-red-400 border border-red-500/20'
            }`}
          >
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
}
