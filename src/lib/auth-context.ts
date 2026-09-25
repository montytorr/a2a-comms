import { createServerClient } from '@/lib/db/server';
import { sessionUser } from '@/lib/auth/session';
import { normalizeAgentTrustPolicy, type AgentTrustPolicyConfig } from '@/lib/agent-trust-policy';
import { normalizeAgentTrustTier, type AgentTrustTier } from '@/lib/trust-tiers';

export interface AuthUserAgent {
  id: string;
  name: string;
  displayName: string;
  trustTier: AgentTrustTier;
  trustPolicy: ReturnType<typeof normalizeAgentTrustPolicy>;
}

export interface AuthUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  displayName: string;
  agentIds: string[]; // agent IDs owned by this user
  agents: AuthUserAgent[];
  trustTier: 'internal' | 'partner' | 'external';
  trustPolicy: ReturnType<typeof normalizeAgentTrustPolicy>;
}

const TRUST_TIER_ORDER: AgentTrustTier[] = ['external', 'partner', 'internal'];

function selectLeastPrivilegeTier(tiers: AgentTrustTier[]): AgentTrustTier {
  return tiers.reduce<AgentTrustTier>((current, tier) => (
    TRUST_TIER_ORDER.indexOf(tier) < TRUST_TIER_ORDER.indexOf(current) ? tier : current
  ), 'internal');
}

function selectMostRestrictiveTier<T extends AgentTrustTier>(tiers: T[], fallback: T): T {
  return tiers.reduce<T>((current, tier) => (
    TRUST_TIER_ORDER.indexOf(tier) < TRUST_TIER_ORDER.indexOf(current) ? tier : current
  ), fallback);
}

function buildLeastPrivilegeTrustPolicy(policies: AgentTrustPolicyConfig[]): AgentTrustPolicyConfig {
  if (policies.length === 0) {
    return normalizeAgentTrustPolicy(null);
  }

  return {
    webhooks: {
      management: selectMostRestrictiveTier(
        policies.map((policy) => policy.webhooks.management),
        normalizeAgentTrustPolicy(null).webhooks.management,
      ),
    },
    observer_project_access: {
      read: selectMostRestrictiveTier(
        policies.map((policy) => policy.observer_project_access.read),
        normalizeAgentTrustPolicy(null).observer_project_access.read,
      ),
      download_project_attachments: selectMostRestrictiveTier(
        policies.map((policy) => policy.observer_project_access.download_project_attachments),
        normalizeAgentTrustPolicy(null).observer_project_access.download_project_attachments,
      ),
    },
    project_participants: {
      list_members: selectMostRestrictiveTier(
        policies.map((policy) => policy.project_participants.list_members),
        normalizeAgentTrustPolicy(null).project_participants.list_members,
      ),
      list_observers: selectMostRestrictiveTier(
        policies.map((policy) => policy.project_participants.list_observers),
        normalizeAgentTrustPolicy(null).project_participants.list_observers,
      ),
    },
    project_invitations: {
      list_pending: selectMostRestrictiveTier(
        policies.map((policy) => policy.project_invitations.list_pending),
        normalizeAgentTrustPolicy(null).project_invitations.list_pending,
      ),
    },
  };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const user = await sessionUser();
  if (!user) return null;

  // Use service role client for profile + agents lookup
  const adminClient = createServerClient();

  const [profileRes, agentsRes] = await Promise.all([
    adminClient.from('user_profiles').select('*').eq('id', user.id).single(),
    adminClient.from('agents').select('id, name, display_name, trust_tier, trust_policy').eq('owner_user_id', user.id),
  ]);

  const normalizedAgents = (agentsRes.data || []).map((agent) => ({
    id: agent.id,
    name: typeof agent.name === 'string' && agent.name.trim().length > 0 ? agent.name : agent.id,
    displayName: typeof agent.display_name === 'string' && agent.display_name.trim().length > 0
      ? agent.display_name
      : (typeof agent.name === 'string' && agent.name.trim().length > 0 ? agent.name : agent.id),
    trustTier: normalizeAgentTrustTier(agent.trust_tier),
    trustPolicy: normalizeAgentTrustPolicy(agent.trust_policy ?? null),
  }));

  const normalizedTrustTier = normalizedAgents.length > 0
    ? selectLeastPrivilegeTier(normalizedAgents.map((agent) => agent.trustTier))
    : 'external';

  const primaryTrustPolicy = buildLeastPrivilegeTrustPolicy(
    normalizedAgents.map((agent) => agent.trustPolicy),
  );

  return {
    id: user.id,
    email: user.email || '',
    isSuperAdmin: profileRes.data?.is_super_admin || false,
    displayName:
      profileRes.data?.display_name || user.email?.split('@')[0] || 'User',
    agentIds: normalizedAgents.map((agent) => agent.id),
    agents: normalizedAgents,
    trustTier: normalizedTrustTier,
    trustPolicy: primaryTrustPolicy,
  };
}
