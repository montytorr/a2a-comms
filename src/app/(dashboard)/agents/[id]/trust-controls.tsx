'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_TRUST_TIERS, TRUST_TIER_DESCRIPTIONS, TRUST_TIER_LABELS, type AgentTrustTier } from '@/lib/trust-tiers';

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
        const res = await fetch(`/api/v1/agents/${agentId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trust_tier: tier,
            trust_notes: notes.trim() || null,
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || 'Failed to update trust controls');
        }

        setSuccess('Trust controls updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update trust controls');
      }
    });
  }

  return (
    <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--peri-bg)', borderRadius: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <p className="upper" style={{ fontSize: '10px', color: 'var(--peri)', fontWeight: 600 }}>Trust controls</p>
          <h2 className="h3" style={{ marginTop: '0.25rem' }}>Collaboration permissions</h2>
          <p className="muted" style={{ fontSize: '11px', marginTop: '0.25rem', maxWidth: '36rem' }}>
            This is the agent&apos;s site-wide default posture. It drives project membership, observer access, handoff eligibility, and broker or generic contract policy from one central helper.
          </p>
        </div>
        {!canEdit && (
          <span className="pill pill--ghost">
            View only, owner/admin can edit
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0,220px) 1fr' }}>
        <div>
          <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
            Trust tier
          </label>
          <select
            value={tier}
            disabled={!canEdit || isPending}
            onChange={(e) => setTier(e.target.value as AgentTrustTier)}
            className="cp-select"
            style={{ width: '100%', opacity: !canEdit || isPending ? 0.6 : 1 }}
          >
            {AGENT_TRUST_TIERS.map((option) => (
              <option key={option} value={option}>{TRUST_TIER_LABELS[option]}</option>
            ))}
          </select>
          <p className="dim" style={{ fontSize: '11px', marginTop: '0.5rem', lineHeight: 1.5 }}>{TRUST_TIER_DESCRIPTIONS[tier]}</p>
        </div>

        <div>
          <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>
            Trust notes
          </label>
          <textarea
            value={notes}
            disabled={!canEdit || isPending}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Document who vetted this agent, why it has this tier, or any caveats."
            className="cp-input"
            style={{ width: '100%', resize: 'none', opacity: !canEdit || isPending ? 0.6 : 1 }}
          />
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="dim" style={{ fontSize: '11px' }}>
          Internal = full collaboration, Partner = observe/broker, External = registry-only or observer-by-explicit-same-owner exception. This setting affects how the whole site treats this agent.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {error && <span style={{ fontSize: '11px', color: 'var(--rose)' }}>{error}</span>}
          {success && !error && <span style={{ fontSize: '11px', color: 'var(--mint)' }}>{success}</span>}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isPending}
              className="btn btn--ghost btn--sm"
              style={{ color: 'var(--peri)', borderColor: 'var(--peri-bg)' }}
            >
              {isPending ? 'Saving…' : 'Save trust controls'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
