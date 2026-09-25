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


export function normalizeAgentTrustTier(value: unknown): AgentTrustTier {
  return typeof value === 'string' && AGENT_TRUST_TIERS.includes(value as AgentTrustTier)
    ? value as AgentTrustTier
    : 'external';
}

export function isAgentTrustTier(value: unknown): value is AgentTrustTier {
  return typeof value === 'string' && AGENT_TRUST_TIERS.includes(value as AgentTrustTier);
}


export interface TrustPolicyAgent {
  id: string;
  name: string;
  owner_user_id?: string | null;
  trust_tier?: string | null;
}

/**
 * The exact column list every trust gate needs. Select this, not a subset:
 * a gate reading a column that was never fetched sees `undefined`, and
 * `normalizeAgentTrustTier` turns `undefined` into 'external' — so the omission
 * does not fail, it silently denies. That cost a day on 2026-09-21, when
 * `POST /v1/projects/:id/invitations` selected only `id, name, display_name`
 * and refused every invite as "external-tier", including partner agents.
 */
export const TRUST_POLICY_AGENT_COLUMNS = 'id, name, display_name, owner_user_id, trust_tier';

/**
 * Distinguishes "the column was not selected" from "the agent has no tier".
 * A missing key is a bug in the caller, not a fact about the agent, so it is
 * loud. A null/unrecognised value is a real data state and still normalises to
 * the most restrictive tier.
 */
function gateTier(agent: TrustPolicyAgent, role: 'caller' | 'target'): AgentTrustTier {
  if (!('trust_tier' in agent)) {
    throw new Error(
      `trust gate: ${role} agent ${agent.id} was loaded without trust_tier. ` +
      `Select TRUST_POLICY_AGENT_COLUMNS — the gate cannot be evaluated on a partial row.`
    );
  }
  return normalizeAgentTrustTier(agent.trust_tier);
}

export interface TrustGateResult {
  allowed: boolean;
  reason?: string;
  callerTier: AgentTrustTier;
  targetTier: AgentTrustTier;
}

export interface MultiTargetTrustGateResult {
  allowed: boolean;
  reason?: string;
  callerTier: AgentTrustTier;
  blockedTargets: Array<{ id: string; name: string; targetTier: AgentTrustTier; reason: string }>;
}

export interface ContractCollaborationGateResult {
  allowed: boolean;
  reason?: string;
  callerTier: AgentTrustTier;
  blockedInvitees: Array<{ id: string; name: string; targetTier: AgentTrustTier; reason: string }>;
  blockedObservers: Array<{ id: string; name: string; targetTier: AgentTrustTier; reason: string }>;
}

function sameOwner(caller: TrustPolicyAgent, target: TrustPolicyAgent) {
  // Same trap as gateTier: an unselected owner_user_id is `undefined` and would
  // quietly read as "different owners", which is the restrictive answer.
  for (const [role, agent] of [['caller', caller], ['target', target]] as const) {
    if (!('owner_user_id' in agent)) {
      throw new Error(
        `trust gate: ${role} agent ${agent.id} was loaded without owner_user_id. ` +
        `Select TRUST_POLICY_AGENT_COLUMNS — ownership cannot be compared on a partial row.`
      );
    }
  }
  return !!caller.owner_user_id && !!target.owner_user_id && caller.owner_user_id === target.owner_user_id;
}

export function evaluateProjectMemberInvite(caller: TrustPolicyAgent, target: TrustPolicyAgent): TrustGateResult {
  const callerTier = gateTier(caller, 'caller');
  const targetTier = gateTier(target, 'target');

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
  const callerTier = gateTier(caller, 'caller');
  const targetTier = gateTier(target, 'target');

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
  const callerTier = gateTier(caller, 'caller');
  const targetTier = gateTier(target, 'target');

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
  const callerTier = gateTier(caller, 'caller');
  const targetTier = gateTier(target, 'target');

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

export function evaluateGenericContractInvite(caller: TrustPolicyAgent, target: TrustPolicyAgent): TrustGateResult {
  const callerTier = gateTier(caller, 'caller');
  const targetTier = gateTier(target, 'target');

  if (targetTier === 'external' && !sameOwner(caller, target)) {
    return {
      allowed: false,
      reason: 'External-tier agents cannot receive generic contract proposals across owners until promoted to partner or invited into a narrower project observer flow first.',
      callerTier,
      targetTier,
    };
  }

  return { allowed: true, callerTier, targetTier };
}

export function evaluateContractInvitees(caller: TrustPolicyAgent, targets: TrustPolicyAgent[]): MultiTargetTrustGateResult {
  const callerTier = gateTier(caller, 'caller');
  const blockedTargets = targets.flatMap((target) => {
    const gate = evaluateGenericContractInvite(caller, target);
    return gate.allowed
      ? []
      : [{
          id: target.id,
          name: target.name,
          targetTier: gate.targetTier,
          reason: gate.reason || 'Invitee trust tier blocks generic contract proposal',
        }];
  });

  if (blockedTargets.length > 0) {
    const first = blockedTargets[0];
    const suffix = blockedTargets.length > 1 ? ` (+${blockedTargets.length - 1} more)` : '';
    return {
      allowed: false,
      reason: `${first.name}: ${first.reason}${suffix}`,
      callerTier,
      blockedTargets,
    };
  }

  return { allowed: true, callerTier, blockedTargets: [] };
}

export function evaluateContractObservers(caller: TrustPolicyAgent, targets: TrustPolicyAgent[]): MultiTargetTrustGateResult {
  const callerTier = gateTier(caller, 'caller');
  const blockedTargets = targets.flatMap((target) => {
    const gate = evaluateObserverAccess(caller, target);
    return gate.allowed
      ? []
      : [{
          id: target.id,
          name: target.name,
          targetTier: gate.targetTier,
          reason: gate.reason || 'Observer trust tier blocks contract observer access',
        }];
  });

  if (blockedTargets.length > 0) {
    const first = blockedTargets[0];
    const suffix = blockedTargets.length > 1 ? ` (+${blockedTargets.length - 1} more)` : '';
    return {
      allowed: false,
      reason: `${first.name}: ${first.reason}${suffix}`,
      callerTier,
      blockedTargets,
    };
  }

  return { allowed: true, callerTier, blockedTargets: [] };
}

export function evaluateContractCollaboration(
  caller: TrustPolicyAgent,
  invitees: TrustPolicyAgent[],
  observers: TrustPolicyAgent[]
): ContractCollaborationGateResult {
  const callerTier = gateTier(caller, 'caller');
  const inviteeGate = evaluateContractInvitees(caller, invitees);
  const observerGate = evaluateContractObservers(caller, observers);

  if (!inviteeGate.allowed) {
    return {
      allowed: false,
      reason: inviteeGate.reason,
      callerTier,
      blockedInvitees: inviteeGate.blockedTargets,
      blockedObservers: observerGate.blockedTargets,
    };
  }

  if (!observerGate.allowed) {
    return {
      allowed: false,
      reason: observerGate.reason,
      callerTier,
      blockedInvitees: inviteeGate.blockedTargets,
      blockedObservers: observerGate.blockedTargets,
    };
  }

  return {
    allowed: true,
    callerTier,
    blockedInvitees: [],
    blockedObservers: [],
  };
}
