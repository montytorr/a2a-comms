export type AgentTrustTier = 'internal' | 'partner' | 'external';

export const AGENT_TRUST_TIERS: AgentTrustTier[] = ['internal', 'partner', 'external'];

export const TRUST_TIER_LABELS: Record<AgentTrustTier, string> = {
  internal: 'Internal',
  partner: 'Partner',
  external: 'External',
};

export const TRUST_TIER_DESCRIPTIONS: Record<AgentTrustTier, string> = {
  internal: 'First-party or same-owner agents. Full collaboration flows allowed.',
  partner: 'Known third-party agents. Can collaborate, but sensitive project access stays opt-in.',
  external: 'Untrusted or newly introduced agents. Keep them out of project state until explicitly elevated.',
};

export const TRUST_TIER_STYLES: Record<AgentTrustTier, { badge: string; dot: string }> = {
  internal: {
    badge: 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300',
    dot: 'bg-emerald-400',
  },
  partner: {
    badge: 'border-amber-500/20 bg-amber-500/[0.08] text-amber-300',
    dot: 'bg-amber-400',
  },
  external: {
    badge: 'border-red-500/20 bg-red-500/[0.08] text-red-300',
    dot: 'bg-red-400',
  },
};

export function normalizeAgentTrustTier(value: unknown): AgentTrustTier {
  return typeof value === 'string' && AGENT_TRUST_TIERS.includes(value as AgentTrustTier)
    ? value as AgentTrustTier
    : 'external';
}

export function isAgentTrustTier(value: unknown): value is AgentTrustTier {
  return typeof value === 'string' && AGENT_TRUST_TIERS.includes(value as AgentTrustTier);
}

export function getAgentTrustTierSummary(value: unknown): string {
  const tier = normalizeAgentTrustTier(value);
  return TRUST_TIER_DESCRIPTIONS[tier];
}

export interface TrustPolicyAgent {
  id: string;
  name: string;
  owner_user_id?: string | null;
  trust_tier?: string | null;
}

export interface TrustGateResult {
  allowed: boolean;
  reason?: string;
  callerTier: AgentTrustTier;
  targetTier: AgentTrustTier;
}

function sameOwner(caller: TrustPolicyAgent, target: TrustPolicyAgent) {
  return !!caller.owner_user_id && !!target.owner_user_id && caller.owner_user_id === target.owner_user_id;
}

export function evaluateProjectMemberInvite(caller: TrustPolicyAgent, target: TrustPolicyAgent): TrustGateResult {
  const callerTier = normalizeAgentTrustTier(caller.trust_tier);
  const targetTier = normalizeAgentTrustTier(target.trust_tier);

  if (targetTier === 'external') {
    return {
      allowed: false,
      reason: 'External-tier agents cannot be invited as project members. Start with observer access or raise their trust tier first.',
      callerTier,
      targetTier,
    };
  }

  return { allowed: true, callerTier, targetTier };
}

export function evaluateObserverAccess(caller: TrustPolicyAgent, target: TrustPolicyAgent): TrustGateResult {
  const callerTier = normalizeAgentTrustTier(caller.trust_tier);
  const targetTier = normalizeAgentTrustTier(target.trust_tier);

  if (targetTier === 'external' && !sameOwner(caller, target)) {
    return {
      allowed: false,
      reason: 'External-tier agents need at least partner trust before they can observe another owner\'s project.',
      callerTier,
      targetTier,
    };
  }

  return { allowed: true, callerTier, targetTier };
}

export function evaluateHandoffInvite(caller: TrustPolicyAgent, target: TrustPolicyAgent): TrustGateResult {
  const callerTier = normalizeAgentTrustTier(caller.trust_tier);
  const targetTier = normalizeAgentTrustTier(target.trust_tier);

  if (targetTier !== 'internal') {
    return {
      allowed: false,
      reason: 'Only internal-tier agents can receive task handoff contracts. Third-party agents should be brought in as observers or brokers first.',
      callerTier,
      targetTier,
    };
  }

  return { allowed: true, callerTier, targetTier };
}

export function evaluateEscalationBroker(caller: TrustPolicyAgent, target: TrustPolicyAgent): TrustGateResult {
  const callerTier = normalizeAgentTrustTier(caller.trust_tier);
  const targetTier = normalizeAgentTrustTier(target.trust_tier);

  if (targetTier === 'external') {
    return {
      allowed: false,
      reason: 'External-tier agents cannot broker escalations. Promote them to partner if you trust them with coordination.',
      callerTier,
      targetTier,
    };
  }

  return { allowed: true, callerTier, targetTier };
}
