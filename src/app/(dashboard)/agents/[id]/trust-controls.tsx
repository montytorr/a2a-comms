'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_TRUST_TIERS, TRUST_TIER_DESCRIPTIONS, TRUST_TIER_LABELS, type AgentTrustTier } from '@/lib/trust-tiers';
import { updateAgentTrustControls } from './actions';
import styles from './agent-detail.module.css';

interface TrustControlsProps {
  agentId: string;
  initialTier: AgentTrustTier;
  initialNotes: string | null;
  canEdit: boolean;
}

export default function TrustControls({ agentId, initialTier, initialNotes, canEdit }: TrustControlsProps) {
  const router = useRouter();
  const [tier, setTier] = useState<AgentTrustTier>(initialTier);
  const [notes, setNotes] = useState(initialNotes || '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(() => tier !== initialTier || notes.trim() !== (initialNotes || ''), [tier, notes, initialTier, initialNotes]);

  function handleSave() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const result = await updateAgentTrustControls(agentId, {
          trust_tier: tier,
          trust_notes: notes.trim() || null,
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to update trust controls');
        }

        setSuccess('Trust controls updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update trust controls');
      }
    });
  }

  return (
    <section className={`card ${styles.section}`} aria-labelledby="agent-tier-heading">
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadText}>
          <p className={styles.eyebrow}>Enforced</p>
          <h2 id="agent-tier-heading" className={styles.sectionTitle}>Trust tier</h2>
          <p className={styles.sectionSub}>
            The agent&apos;s site-wide posture, and the single most load-bearing field on this page:
            project membership, observer access, handoff eligibility and contract policy all read from
            it, and every gate below compares against it.
          </p>
        </div>
        {!canEdit && <span className="pill pill--ghost">View only, owner/admin can edit</span>}
      </div>

      <div className={styles.gateGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="agent-trust-tier">Tier</label>
          <select
            id="agent-trust-tier"
            value={tier}
            disabled={!canEdit || isPending}
            onChange={(e) => setTier(e.target.value as AgentTrustTier)}
            className="cp-select"
            style={{ width: '100%' }}
          >
            {AGENT_TRUST_TIERS.map((option) => (
              <option key={option} value={option}>{TRUST_TIER_LABELS[option]}</option>
            ))}
          </select>
          <p className={styles.fieldHelp}>{TRUST_TIER_DESCRIPTIONS[tier]}</p>
        </div>

        <div className={styles.field} style={{ gridColumn: 'span 2' }}>
          <label className={styles.fieldLabel} htmlFor="agent-trust-notes">Why it has this tier</label>
          <textarea
            id="agent-trust-notes"
            value={notes}
            disabled={!canEdit || isPending}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Who vetted this agent, and any caveats."
            className="cp-textarea"
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <p className={styles.actionsNote}>
          {error ? <span className={styles.err}>{error}</span>
            : success ? <span className={styles.ok}>{success}</span>
            : 'Internal = full collaboration · Partner = observe and broker · External = registry-only.'}
        </p>
        {canEdit && (
          <button type="button" onClick={handleSave} disabled={!dirty || isPending} className="btn btn--primary btn--sm">
            {isPending ? 'Saving…' : 'Save tier'}
          </button>
        )}
      </div>
    </section>
  );
}
