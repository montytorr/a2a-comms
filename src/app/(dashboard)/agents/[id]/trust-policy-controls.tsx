'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type AgentTrustTier } from '@/lib/trust-tiers';
import {
  normalizeAgentTrustPolicy,
  type AgentTrustPolicyConfig,
} from '@/lib/agent-trust-policy';

interface TrustPolicyControlsProps {
  agentId: string;
  initialTier: AgentTrustTier;
  initialPolicy: AgentTrustPolicyConfig | null | undefined;
  canEdit: boolean;
}

function policyToComparableString(policy: AgentTrustPolicyConfig) {
  return JSON.stringify(policy);
}

export default function TrustPolicyControls({
  agentId,
  initialTier,
  initialPolicy,
  canEdit,
}: TrustPolicyControlsProps) {
  const router = useRouter();
  const normalizedInitialPolicy = useMemo(() => normalizeAgentTrustPolicy(initialPolicy), [initialPolicy]);
  const [webhookManagement, setWebhookManagement] = useState<'internal' | 'partner'>(normalizedInitialPolicy.webhooks.management);
  const [observerRead, setObserverRead] = useState<'internal' | 'partner' | 'external'>(normalizedInitialPolicy.observer_project_access.read);
  const [observerAttachmentDownloads, setObserverAttachmentDownloads] = useState<'internal' | 'partner'>(normalizedInitialPolicy.observer_project_access.download_project_attachments);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const policy = useMemo(() => normalizeAgentTrustPolicy({
    version: 1,
    webhooks: { management: webhookManagement },
    observer_project_access: {
      read: observerRead,
      download_project_attachments: observerAttachmentDownloads,
    },
  }), [webhookManagement, observerRead, observerAttachmentDownloads]);

  const dirty = policyToComparableString(policy) !== policyToComparableString(normalizedInitialPolicy);

  function handleSave() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/agents/${agentId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trust_policy: policy,
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || 'Failed to update trust policy');
        }

        setSuccess('Trust policy updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update trust policy');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.04] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-[0.18em]">Trust policy</p>
          <h2 className="text-[15px] font-semibold text-white mt-1">Sensitive surface thresholds</h2>
          <p className="text-[11px] text-gray-400 mt-1 max-w-xl">
            Fine-grained gates layered on top of the agent&apos;s current {initialTier} tier. Use this when the base tier is too blunt. These thresholds govern what this agent can manage or see across the platform, but only the owner or an admin can change them.
          </p>
        </div>
        {!canEdit && (
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-gray-500">
            View only
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
            Webhook management
          </label>
          <select
            value={webhookManagement}
            disabled={!canEdit || isPending}
            onChange={(e) => setWebhookManagement(e.target.value as 'internal' | 'partner')}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-violet-500/30 disabled:opacity-60"
          >
            <option value="partner">Partner+</option>
            <option value="internal">Internal only</option>
          </select>
          <p className="text-[11px] text-gray-500 mt-2">Controls webhook management surfaces like list, register, update, test, and delete.</p>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
            Observer project reads
          </label>
          <select
            value={observerRead}
            disabled={!canEdit || isPending}
            onChange={(e) => setObserverRead(e.target.value as 'internal' | 'partner' | 'external')}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-violet-500/30 disabled:opacity-60"
          >
            <option value="external">External+</option>
            <option value="partner">Partner+</option>
            <option value="internal">Internal only</option>
          </select>
          <p className="text-[11px] text-gray-500 mt-2">Applies to observer read visibility on project, task, run, and checkpoint detail surfaces.</p>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
            Observer attachment downloads
          </label>
          <select
            value={observerAttachmentDownloads}
            disabled={!canEdit || isPending}
            onChange={(e) => setObserverAttachmentDownloads(e.target.value as 'internal' | 'partner')}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-violet-500/30 disabled:opacity-60"
          >
            <option value="partner">Partner+</option>
            <option value="internal">Internal only</option>
          </select>
          <p className="text-[11px] text-gray-500 mt-2">Project attachment downloads stay tighter than plain observer reads. This gate is enforced separately from read visibility.</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-gray-500">
          Policy narrows sensitive access. In current wiring, other trust-policy fields like participant-list and pending-invitation visibility are also enforced, even though they are not editable from this card yet. Nothing here upgrades an agent above its base tier.
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[11px] text-red-300">{error}</span>}
          {success && !error && <span className="text-[11px] text-emerald-300">{success}</span>}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isPending}
              className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving…' : 'Save trust policy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
