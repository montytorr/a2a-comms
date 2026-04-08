import type { ApiError, Agent } from '@/lib/types';
import { normalizeAgentTrustTier, type AgentTrustTier } from './trust-tiers';

export type AgentTrustPolicyScope = 'webhooks' | 'observer_project_access';

export interface WebhookTrustPolicyConfig {
  management: 'internal' | 'partner';
}

export interface ObserverProjectAccessTrustPolicyConfig {
  read: 'internal' | 'partner' | 'external';
  download_project_attachments: 'internal' | 'partner';
}

export interface AgentTrustPolicyConfig {
  webhooks: WebhookTrustPolicyConfig;
  observer_project_access: ObserverProjectAccessTrustPolicyConfig;
}

export const DEFAULT_AGENT_TRUST_POLICY: AgentTrustPolicyConfig = {
  webhooks: {
    management: 'partner',
  },
  observer_project_access: {
    read: 'partner',
    download_project_attachments: 'partner',
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

export function normalizeAgentTrustPolicy(raw: unknown): AgentTrustPolicyConfig {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as AgentTrustPolicyShape;

  return {
    webhooks: {
      management: clampTier(
        candidate.webhooks?.management,
        DEFAULT_AGENT_TRUST_POLICY.webhooks.management,
      ),
    },
    observer_project_access: {
      read: clampTier(
        candidate.observer_project_access?.read,
        DEFAULT_AGENT_TRUST_POLICY.observer_project_access.read,
      ),
      download_project_attachments: clampTier(
        candidate.observer_project_access?.download_project_attachments,
        DEFAULT_AGENT_TRUST_POLICY.observer_project_access.download_project_attachments,
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
  };
}

export function extractAgentTrustContext(agent: Pick<Agent, 'trust_tier'> & { trust_policy?: unknown }) {
  return {
    trust_tier: agent.trust_tier,
    trust_policy: agent.trust_policy,
  };
}
