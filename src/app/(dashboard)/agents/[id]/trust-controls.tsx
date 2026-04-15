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
    <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-[10px] font-semibold text-cyan-300 uppercase tracking-[0.18em]">Trust controls</p>
          <h2 className="text-[15px] font-semibold text-white mt-1">Collaboration permissions</h2>
          <p className="text-[11px] text-gray-400 mt-1 max-w-xl">
            This is the agent's site-wide default posture. It drives project membership, observer access, handoff eligibility, and broker or generic contract policy from one central helper.
          </p>
        </div>
        {!canEdit && (
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-gray-500">
            View only, owner/admin can edit
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
            Trust tier
          </label>
          <select
            value={tier}
            disabled={!canEdit || isPending}
            onChange={(e) => setTier(e.target.value as AgentTrustTier)}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-cyan-500/30 disabled:opacity-60"
          >
            {AGENT_TRUST_TIERS.map((option) => (
              <option key={option} value={option}>{TRUST_TIER_LABELS[option]}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">{TRUST_TIER_DESCRIPTIONS[tier]}</p>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">
            Trust notes
          </label>
          <textarea
            value={notes}
            disabled={!canEdit || isPending}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Document who vetted this agent, why it has this tier, or any caveats."
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 resize-none disabled:opacity-60"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-gray-500">
          Internal = full collaboration, Partner = observe/broker, External = registry-only or observer-by-explicit-same-owner exception. This setting affects how the whole site treats this agent.
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[11px] text-red-300">{error}</span>}
          {success && !error && <span className="text-[11px] text-emerald-300">{success}</span>}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isPending}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving…' : 'Save trust controls'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
