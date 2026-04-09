import type { ApiError, Agent } from '@/lib/types';
import { normalizeAgentTrustTier, type AgentTrustTier } from './trust-tiers';

export type AgentTrustPolicyScope = 'webhooks' | 'observer_project_access' | 'project_participants' | 'project_invitations';

export interface WebhookTrustPolicyConfig {
  management: 'internal' | 'partner';
}

export interface ObserverProjectAccessTrustPolicyConfig {
  read: 'internal' | 'partner' | 'external';
  download_project_attachments: 'internal' | 'partner';
}

export interface ProjectParticipantTrustPolicyConfig {
  list_members: 'internal' | 'partner' | 'external';
  list_observers: 'internal' | 'partner';
}

export interface ProjectInvitationTrustPolicyConfig {
  list_pending: 'internal' | 'partner';
}

export interface AgentTrustPolicyConfig {
  webhooks: WebhookTrustPolicyConfig;
  observer_project_access: ObserverProjectAccessTrustPolicyConfig;
  project_participants: ProjectParticipantTrustPolicyConfig;
  project_invitations: ProjectInvitationTrustPolicyConfig;
}

export const DEFAULT_AGENT_TRUST_POLICY: AgentTrustPolicyConfig = {
  webhooks: {
    management: 'partner',
  },
  observer_project_access: {
    read: 'partner',
    download_project_attachments: 'partner',
  },
  project_participants: {
    list_members: 'partner',
    list_observers: 'partner',
  },
  project_invitations: {
    list_pending: 'internal',
  },
};

export interface AgentTrustPolicyShape {
  version?: number;
  webhooks?: {
    management?: unknown;
  };
  observer_project_access?: {
    read?: unknown;
    download_project_attachments?: unknown;
  };
  project_participants?: {
    list_members?: unknown;
    list_observers?: unknown;
  };
  project_invitations?: {
    list_pending?: unknown;
  };
}

export interface TrustPolicyAccessContext {
  trust_tier?: string | null;
  trust_policy?: unknown;
}

export interface TrustPolicyDecision {
  allowed: boolean;
  callerTier: AgentTrustTier;
  requiredTier: AgentTrustTier;
  policy: AgentTrustPolicyConfig;
  status?: number;
  body?: ApiError;
}

const TIER_RANK: Record<AgentTrustTier, number> = {
  external: 0,
  partner: 1,
  internal: 2,
};

function clampTier(value: unknown, fallback: AgentTrustTier): AgentTrustTier {
  if (value === 'internal' || value === 'partner' || value === 'external') {
    return value;
  }
  return fallback;
}

function clampWebhookManagementTier(
  value: unknown,
  fallback: WebhookTrustPolicyConfig['management'],
): WebhookTrustPolicyConfig['management'] {
  if (value === 'internal' || value === 'partner') {
    return value;
  }
  return fallback;
}

function clampAttachmentDownloadTier(
  value: unknown,
  fallback: ObserverProjectAccessTrustPolicyConfig['download_project_attachments'],
): ObserverProjectAccessTrustPolicyConfig['download_project_attachments'] {
  if (value === 'internal' || value === 'partner') {
    return value;
  }
  return fallback;
}

function clampObserverListTier(
  value: unknown,
  fallback: ProjectParticipantTrustPolicyConfig['list_observers'],
): ProjectParticipantTrustPolicyConfig['list_observers'] {
  if (value === 'internal' || value === 'partner') {
    return value;
  }
  return fallback;
}

export function normalizeAgentTrustPolicy(raw: unknown): AgentTrustPolicyConfig {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as AgentTrustPolicyShape;

  return {
    webhooks: {
      management: clampWebhookManagementTier(
        candidate.webhooks?.management,
        DEFAULT_AGENT_TRUST_POLICY.webhooks.management,
      ),
    },
    observer_project_access: {
      read: clampTier(
        candidate.observer_project_access?.read,
        DEFAULT_AGENT_TRUST_POLICY.observer_project_access.read,
      ),
      download_project_attachments: clampAttachmentDownloadTier(
        candidate.observer_project_access?.download_project_attachments,
        DEFAULT_AGENT_TRUST_POLICY.observer_project_access.download_project_attachments,
      ),
    },
    project_participants: {
      list_members: clampTier(
        candidate.project_participants?.list_members,
        DEFAULT_AGENT_TRUST_POLICY.project_participants.list_members,
      ),
      list_observers: clampObserverListTier(
        candidate.project_participants?.list_observers,
        DEFAULT_AGENT_TRUST_POLICY.project_participants.list_observers,
      ),
    },
    project_invitations: {
      list_pending: clampWebhookManagementTier(
        candidate.project_invitations?.list_pending,
        DEFAULT_AGENT_TRUST_POLICY.project_invitations.list_pending,
      ),
    },
  };
}

export function canAccessPolicyTier(callerTier: AgentTrustTier, requiredTier: AgentTrustTier): boolean {
  return TIER_RANK[callerTier] >= TIER_RANK[requiredTier];
}

function evaluatePolicyTierAccess(
  context: TrustPolicyAccessContext,
  requiredTier: AgentTrustTier,
  errorBuilder: (callerTier: AgentTrustTier, requiredTier: AgentTrustTier) => string,
): TrustPolicyDecision {
  const callerTier = normalizeAgentTrustTier(context.trust_tier);
  const policy = normalizeAgentTrustPolicy(context.trust_policy);

  if (canAccessPolicyTier(callerTier, requiredTier)) {
    return {
      allowed: true,
      callerTier,
      requiredTier,
      policy,
    };
  }

  return {
    allowed: false,
    callerTier,
    requiredTier,
    policy,
    status: 403,
    body: {
      error: errorBuilder(callerTier, requiredTier),
      code: 'TRUST_TIER_BLOCKED',
    },
  };
}

export function evaluateWebhookPolicyAccess(context: TrustPolicyAccessContext): TrustPolicyDecision {
  const policy = normalizeAgentTrustPolicy(context.trust_policy);
  return evaluatePolicyTierAccess(
    context,
    policy.webhooks.management,
    (callerTier, requiredTier) => `Webhook management requires ${requiredTier}-tier trust. This agent is ${callerTier}-tier.`,
  );
}

export function evaluateObserverProjectReadPolicyAccess(context: TrustPolicyAccessContext): TrustPolicyDecision {
  const policy = normalizeAgentTrustPolicy(context.trust_policy);
  return evaluatePolicyTierAccess(
    context,
    policy.observer_project_access.read,
    (callerTier, requiredTier) => `Observer project read access requires ${requiredTier}-tier trust. This agent is ${callerTier}-tier.`,
  );
}

export function evaluateObserverProjectAttachmentDownloadPolicyAccess(context: TrustPolicyAccessContext): TrustPolicyDecision {
  const policy = normalizeAgentTrustPolicy(context.trust_policy);
  return evaluatePolicyTierAccess(
    context,
    policy.observer_project_access.download_project_attachments,
    (callerTier, requiredTier) => `Observer project attachment downloads require ${requiredTier}-tier trust. This agent is ${callerTier}-tier.`,
  );
}

export function evaluateProjectMemberListPolicyAccess(context: TrustPolicyAccessContext): TrustPolicyDecision {
  const policy = normalizeAgentTrustPolicy(context.trust_policy);
  return evaluatePolicyTierAccess(
    context,
    policy.project_participants.list_members,
    (callerTier, requiredTier) => `Observer project member visibility requires ${requiredTier}-tier trust. This agent is ${callerTier}-tier.`,
  );
}

export function evaluateProjectObserverListPolicyAccess(context: TrustPolicyAccessContext): TrustPolicyDecision {
  const policy = normalizeAgentTrustPolicy(context.trust_policy);
  return evaluatePolicyTierAccess(
    context,
    policy.project_participants.list_observers,
    (callerTier, requiredTier) => `Observer project observer visibility requires ${requiredTier}-tier trust. This agent is ${callerTier}-tier.`,
  );
}

export function evaluateProjectInvitationListPolicyAccess(context: TrustPolicyAccessContext): TrustPolicyDecision {
  const policy = normalizeAgentTrustPolicy(context.trust_policy);
  return evaluatePolicyTierAccess(
    context,
    policy.project_invitations.list_pending,
    (callerTier, requiredTier) => `Observer project invitation visibility requires ${requiredTier}-tier trust. This agent is ${callerTier}-tier.`,
  );
}

export function buildDefaultAgentTrustPolicyForTier(trustTier: AgentTrustTier): AgentTrustPolicyConfig {
  if (trustTier === 'internal') {
    return {
      webhooks: {
        management: 'partner',
      },
      observer_project_access: {
        read: 'partner',
        download_project_attachments: 'partner',
      },
      project_participants: {
        list_members: 'partner',
        list_observers: 'partner',
      },
      project_invitations: {
        list_pending: 'internal',
      },
    };
  }

  if (trustTier === 'partner') {
    return {
      webhooks: {
        management: 'partner',
      },
      observer_project_access: {
        read: 'partner',
        download_project_attachments: 'partner',
      },
      project_participants: {
        list_members: 'partner',
        list_observers: 'partner',
      },
      project_invitations: {
        list_pending: 'internal',
      },
    };
  }

  return {
    webhooks: {
      management: 'partner',
    },
    observer_project_access: {
      read: 'partner',
      download_project_attachments: 'partner',
    },
    project_participants: {
      list_members: 'partner',
      list_observers: 'partner',
    },
    project_invitations: {
      list_pending: 'internal',
    },
  };
}

export function extractAgentTrustContext(agent: Pick<Agent, 'trust_tier'> & { trust_policy?: unknown }) {
  return {
    trust_tier: agent.trust_tier,
    trust_policy: agent.trust_policy,
  };
}
