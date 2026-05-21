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

  const updateSelection = (value: string) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/dashboard/acting-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: value === '__least_privilege__' ? null : value }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('[acting-agent] Selection failed:', body.error || res.statusText);
          alert(`Failed to switch acting agent: ${body.error || res.statusText}`);
          return;
        }
      } catch (err) {
        console.error('[acting-agent] Selection error:', err);
        alert('Failed to switch acting agent. Please try again.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="card card--inset" style={{ padding: '10px 14px', marginBottom: 8 }}>
      <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div className="upper" style={{ fontSize: 10 }}>Acting agent</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
            {actor.fallbackMode === 'selected-agent'
              ? 'Dashboard trust and visibility are scoped to the selected agent.'
              : 'No agent selected, using least-privilege trust across all owned agents.'}
          </div>
        </div>
        <div style={{ minWidth: 240 }}>
          <select
            value={selectedValue}
            disabled={isPending}
            onChange={(e) => updateSelection(e.target.value)}
            className="cp-select"
            style={{ opacity: isPending ? 0.6 : 1 }}
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
