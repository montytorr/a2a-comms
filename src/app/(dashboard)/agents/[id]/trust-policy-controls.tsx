'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type AgentTrustTier } from '@/lib/trust-tiers';
import { updateAgentTrustPolicy } from './actions';
import {
  normalizeAgentTrustPolicy,
  type AgentTrustPolicyConfig,
} from '@/lib/agent-trust-policy';
import styles from './agent-detail.module.css';

interface TrustPolicyControlsProps {
  agentId: string;
  initialTier: AgentTrustTier;
  initialPolicy: AgentTrustPolicyConfig | null | undefined;
  canEdit: boolean;
}

type TierValue = 'internal' | 'partner' | 'external';

const PARTNER_OR_INTERNAL: TierValue[] = ['partner', 'internal'];
const ANY_TIER: TierValue[] = ['external', 'partner', 'internal'];

const OPTION_LABELS: Record<TierValue, string> = {
  external: 'External+',
  partner: 'Partner+',
  internal: 'Internal only',
};

/* Six gates, each a path into the policy object. This was three near-identical
   60-line blocks of JSX, which is why the other three gates — all of them
   enforced — had no control at all and could only be set through
   PATCH /v1/agents/:id. Adding the seventh is now one row. */
const GATES = [
  {
    key: 'webhooks.management',
    label: 'Webhook management',
    options: PARTNER_OR_INTERNAL,
    help: 'List, register, update, test and delete webhooks.',
    get: (p: AgentTrustPolicyConfig) => p.webhooks.management as TierValue,
    set: (p: AgentTrustPolicyConfig, v: TierValue): AgentTrustPolicyConfig =>
      ({ ...p, webhooks: { ...p.webhooks, management: v as 'internal' | 'partner' } }),
  },
  {
    key: 'observer_project_access.read',
    label: 'Observer project reads',
    options: ANY_TIER,
    help: 'Observer read visibility on project, task, run and checkpoint detail.',
    get: (p: AgentTrustPolicyConfig) => p.observer_project_access.read as TierValue,
    set: (p, v) => ({ ...p, observer_project_access: { ...p.observer_project_access, read: v } }),
  },
  {
    key: 'observer_project_access.download_project_attachments',
    label: 'Observer attachment downloads',
    options: PARTNER_OR_INTERNAL,
    help: 'Downloads stay tighter than plain reads, and are gated separately.',
    get: (p: AgentTrustPolicyConfig) => p.observer_project_access.download_project_attachments as TierValue,
    set: (p, v) => ({
      ...p,
      observer_project_access: { ...p.observer_project_access, download_project_attachments: v as 'internal' | 'partner' },
    }),
  },
  {
    key: 'project_participants.list_members',
    label: 'Member list',
    options: ANY_TIER,
    help: 'Who may read a project’s member list.',
    get: (p: AgentTrustPolicyConfig) => p.project_participants.list_members as TierValue,
    set: (p, v) => ({ ...p, project_participants: { ...p.project_participants, list_members: v } }),
  },
  {
    key: 'project_participants.list_observers',
    label: 'Observer list',
    options: PARTNER_OR_INTERNAL,
    help: 'Who may read a project’s observer list and its invitation summary.',
    get: (p: AgentTrustPolicyConfig) => p.project_participants.list_observers as TierValue,
    set: (p, v) => ({ ...p, project_participants: { ...p.project_participants, list_observers: v as 'internal' | 'partner' } }),
  },
  {
    key: 'project_invitations.list_pending',
    label: 'Pending invitations',
    options: PARTNER_OR_INTERNAL,
    help: 'Below this tier, pending invitations are filtered out rather than refused.',
    get: (p: AgentTrustPolicyConfig) => p.project_invitations.list_pending as TierValue,
    set: (p, v) => ({ ...p, project_invitations: { ...p.project_invitations, list_pending: v as 'internal' | 'partner' } }),
  },
] satisfies ReadonlyArray<{
  key: string;
  label: string;
  options: TierValue[];
  help: string;
  get: (p: AgentTrustPolicyConfig) => TierValue;
  set: (p: AgentTrustPolicyConfig, v: TierValue) => AgentTrustPolicyConfig;
}>;

export default function TrustPolicyControls({
  agentId,
  initialTier,
  initialPolicy,
  canEdit,
}: TrustPolicyControlsProps) {
  const router = useRouter();
  const normalizedInitialPolicy = useMemo(() => normalizeAgentTrustPolicy(initialPolicy), [initialPolicy]);
  const [policy, setPolicy] = useState<AgentTrustPolicyConfig>(normalizedInitialPolicy);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(policy) !== JSON.stringify(normalizedInitialPolicy);

  function handleSave() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await updateAgentTrustPolicy(agentId, normalizeAgentTrustPolicy(policy));
        if (!result.success) throw new Error(result.error || 'Failed to update trust policy');
        setSuccess('Trust policy updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update trust policy');
      }
    });
  }

  return (
    <section className={`card ${styles.section}`} aria-labelledby="agent-gates-heading">
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadText}>
          <p className={styles.eyebrow}>Enforced</p>
          <h2 id="agent-gates-heading" className={styles.sectionTitle}>Access gates</h2>
          <p className={styles.sectionSub}>
            Each of these refuses a real request below the tier it names. They narrow the {initialTier} tier;
            none of them can raise an agent above it.
          </p>
        </div>
        {!canEdit && <span className="pill pill--ghost">View only</span>}
      </div>

      <div className={styles.gateGrid}>
        {GATES.map((gate) => (
          <div key={gate.key} className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`gate-${gate.key}`}>{gate.label}</label>
            <select
              id={`gate-${gate.key}`}
              className="cp-select"
              style={{ width: '100%' }}
              value={gate.get(policy)}
              disabled={!canEdit || isPending}
              onChange={(e) => setPolicy((current) => gate.set(current, e.target.value as TierValue))}
            >
              {gate.options.map((option) => (
                <option key={option} value={option}>{OPTION_LABELS[option]}</option>
              ))}
            </select>
            <p className={styles.fieldHelp}>{gate.help}</p>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <p className={styles.actionsNote}>
          {error ? <span className={styles.err}>{error}</span>
            : success ? <span className={styles.ok}>{success}</span>
            : 'All six are enforced server-side. Nothing here upgrades an agent above its base tier.'}
        </p>
        {canEdit && (
          <button type="button" onClick={handleSave} disabled={!dirty || isPending} className="btn btn--primary btn--sm">
            {isPending ? 'Saving…' : 'Save gates'}
          </button>
        )}
      </div>
    </section>
  );
}
