'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type AgentTrustTier } from '@/lib/trust-tiers';
import { updateAgentTrustPolicy } from './actions';
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
    ...normalizedInitialPolicy,
    version: 1,
    webhooks: { ...normalizedInitialPolicy.webhooks, management: webhookManagement },
    observer_project_access: {
      ...normalizedInitialPolicy.observer_project_access,
      read: observerRead,
      download_project_attachments: observerAttachmentDownloads,
    },
  }), [normalizedInitialPolicy, webhookManagement, observerRead, observerAttachmentDownloads]);

  const dirty = policyToComparableString(policy) !== policyToComparableString(normalizedInitialPolicy);

  function handleSave() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const result = await updateAgentTrustPolicy(agentId, policy);
        if (!result.success) {
          throw new Error(result.error || 'Failed to update trust policy');
        }

        setSuccess('Trust policy updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update trust policy');
      }
    });
  }

  return (
    <div className="card card--pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <p className="upper text-2xs" style={{ color: 'var(--peri)', fontWeight: 600 }}>Trust policy</p>
          <h2 className="h3" style={{ marginTop: '0.25rem' }}>Sensitive surface thresholds</h2>
          <p className="muted text-2xs" style={{ marginTop: '0.25rem', maxWidth: '36rem' }}>
Gates layered on the {initialTier} tier, for when the base tier is too blunt. Owner or admin only.
          </p>
        </div>
        {!canEdit && (
          <span className="pill pill--ghost">
            View only
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <div>
          <label className="upper dim text-2xs" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Webhook management
          </label>
          <select
            value={webhookManagement}
            disabled={!canEdit || isPending}
            onChange={(e) => setWebhookManagement(e.target.value as 'internal' | 'partner')}
            className="cp-select"
            style={{ width: '100%', opacity: !canEdit || isPending ? 0.6 : 1 }}
          >
            <option value="partner">Partner+</option>
            <option value="internal">Internal only</option>
          </select>
          <p className="dim text-2xs" style={{ marginTop: '0.5rem' }}>Controls webhook management surfaces like list, register, update, test, and delete.</p>
        </div>

        <div>
          <label className="upper dim text-2xs" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Observer project reads
          </label>
          <select
            value={observerRead}
            disabled={!canEdit || isPending}
            onChange={(e) => setObserverRead(e.target.value as 'internal' | 'partner' | 'external')}
            className="cp-select"
            style={{ width: '100%', opacity: !canEdit || isPending ? 0.6 : 1 }}
          >
            <option value="external">External+</option>
            <option value="partner">Partner+</option>
            <option value="internal">Internal only</option>
          </select>
          <p className="dim text-2xs" style={{ marginTop: '0.5rem' }}>Applies to observer read visibility on project, task, run, and checkpoint detail surfaces.</p>
        </div>

        <div>
          <label className="upper dim text-2xs" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Observer attachment downloads
          </label>
          <select
            value={observerAttachmentDownloads}
            disabled={!canEdit || isPending}
            onChange={(e) => setObserverAttachmentDownloads(e.target.value as 'internal' | 'partner')}
            className="cp-select"
            style={{ width: '100%', opacity: !canEdit || isPending ? 0.6 : 1 }}
          >
            <option value="partner">Partner+</option>
            <option value="internal">Internal only</option>
          </select>
          <p className="dim text-2xs" style={{ marginTop: '0.5rem' }}>Project attachment downloads stay tighter than plain observer reads. This gate is enforced separately from read visibility.</p>
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="dim text-2xs">
          Policy narrows sensitive access. In current wiring, other trust-policy fields like participant-list and pending-invitation visibility are also enforced, even though they are not editable from this card yet. Nothing here upgrades an agent above its base tier.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {error && <span className="text-2xs" style={{ color: 'var(--rose)' }}>{error}</span>}
          {success && !error && <span className="text-2xs" style={{ color: 'var(--mint)' }}>{success}</span>}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isPending}
              className="btn btn--ghost btn--sm"
              style={{ color: 'var(--peri)', borderColor: 'var(--peri-bg)' }}
            >
              {isPending ? 'Saving…' : 'Save trust policy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
