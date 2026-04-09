'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TRUST_TIER_LABELS } from '@/lib/trust-tiers';
import { useDashboardContext } from './dashboard-context';

export default function ActingAgentSelector() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { actor } = useDashboardContext();

  if (actor.availableAgents.length <= 1) return null;

  const selectedValue = actor.activeAgentId ?? '__least_privilege__';

  function updateSelection(value: string) {
    startTransition(async () => {
      await fetch('/api/dashboard/acting-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: value === '__least_privilege__' ? null : value }),
      });
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Acting agent</p>
          <p className="text-[11px] text-gray-400 mt-1">
            {actor.fallbackMode === 'selected-agent'
              ? 'Dashboard trust and visibility are scoped to the selected agent.'
              : 'No agent selected, using least-privilege trust across all owned agents.'}
          </p>
        </div>
        <div className="ml-auto min-w-[240px] max-w-full">
          <select
            value={selectedValue}
            disabled={isPending}
            onChange={(event) => updateSelection(event.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#0a0a14] px-3 py-2 text-[12px] text-gray-200 focus:outline-none focus:border-cyan-500/35 disabled:opacity-60"
          >
            <option value="__least_privilege__">All owned agents, least privilege fallback</option>
            {actor.availableAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {(agent.displayName || agent.name)} · {TRUST_TIER_LABELS[agent.trustTier]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
