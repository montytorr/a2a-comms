import { cookies } from 'next/headers';
import { normalizeAgentTrustPolicy, type AgentTrustPolicyConfig } from '@/lib/agent-trust-policy';
import { normalizeAgentTrustTier, type AgentTrustTier } from '@/lib/trust-tiers';
import { getAuthUser, type AuthUser } from '@/lib/auth-context';

const ACTIVE_AGENT_COOKIE = 'a2a_active_agent';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';
const TRUST_TIER_ORDER: AgentTrustTier[] = ['external', 'partner', 'internal'];

export interface OwnedAgentIdentity {
  id: string;
  name: string;
  displayName: string;
  trustTier: AgentTrustTier;
  trustPolicy: AgentTrustPolicyConfig;
}

export interface AuthActorContext {
  user: AuthUser;
  availableAgents: OwnedAgentIdentity[];
  actingAgent: OwnedAgentIdentity | null;
  actingAgentId: string | null;
  trustTier: AgentTrustTier;
  trustPolicy: AgentTrustPolicyConfig;
  agentScope: string[];
  fallbackMode: 'selected-agent' | 'least-privilege';
}

function selectMostRestrictiveTier<T extends AgentTrustTier>(tiers: T[], fallback: T): T {
  return tiers.reduce<T>((current, tier) => (
    TRUST_TIER_ORDER.indexOf(tier) < TRUST_TIER_ORDER.indexOf(current) ? tier : current
  ), fallback);
}

function buildLeastPrivilegeTrustPolicy(policies: AgentTrustPolicyConfig[]): AgentTrustPolicyConfig {
  const fallback = normalizeAgentTrustPolicy(null);
  if (policies.length === 0) return fallback;

  return {
    webhooks: {
      management: selectMostRestrictiveTier(
        policies.map((policy) => policy.webhooks.management),
        fallback.webhooks.management,
      ),
    },
    observer_project_access: {
      read: selectMostRestrictiveTier(
        policies.map((policy) => policy.observer_project_access.read),
        fallback.observer_project_access.read,
      ),
      download_project_attachments: selectMostRestrictiveTier(
        policies.map((policy) => policy.observer_project_access.download_project_attachments),
        fallback.observer_project_access.download_project_attachments,
      ),
    },
    project_participants: {
      list_members: selectMostRestrictiveTier(
        policies.map((policy) => policy.project_participants.list_members),
        fallback.project_participants.list_members,
      ),
      list_observers: selectMostRestrictiveTier(
        policies.map((policy) => policy.project_participants.list_observers),
        fallback.project_participants.list_observers,
      ),
    },
    project_invitations: {
      list_pending: selectMostRestrictiveTier(
        policies.map((policy) => policy.project_invitations.list_pending),
        fallback.project_invitations.list_pending,
      ),
    },
  };
}

export function buildAgentScope(agentIds: string[]): string[] {
  return agentIds.length > 0 ? agentIds : [EMPTY_UUID];
}

export async function getAuthActorContext(): Promise<AuthActorContext | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const availableAgents = user.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    displayName: agent.displayName,
    trustTier: agent.trustTier,
    trustPolicy: agent.trustPolicy,
  }));

  const cookieStore = await cookies();
  const selectedAgentId = cookieStore.get(ACTIVE_AGENT_COOKIE)?.value || null;
  const actingAgent = selectedAgentId
    ? availableAgents.find((agent) => agent.id === selectedAgentId) || null
    : null;

  if (actingAgent) {
    return {
      user,
      availableAgents,
      actingAgent,
      actingAgentId: actingAgent.id,
      trustTier: actingAgent.trustTier,
      trustPolicy: actingAgent.trustPolicy,
      agentScope: [actingAgent.id],
      fallbackMode: 'selected-agent',
    };
  }

  return {
    user,
    availableAgents,
    actingAgent: null,
    actingAgentId: null,
    trustTier: normalizeAgentTrustTier(user.trustTier),
    trustPolicy: buildLeastPrivilegeTrustPolicy(availableAgents.map((agent) => agent.trustPolicy)),
    agentScope: buildAgentScope(user.agentIds),
    fallbackMode: 'least-privilege',
  };
}
