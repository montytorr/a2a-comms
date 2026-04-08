import type { ApiError } from '@/lib/types';
import { normalizeAgentTrustTier, type AgentTrustTier } from './trust-tiers';
import { evaluateWebhookPolicyAccess } from './agent-trust-policy';

export type WebhookManagementAction = 'register' | 'update' | 'delete' | 'test' | 'list';

export interface WebhookTrustPolicyInput {
  trust_tier?: string | null;
}

export type WebhookTrustPolicyDecision =
  | { allowed: true; callerTier: AgentTrustTier }
  | { allowed: false; callerTier: AgentTrustTier; status: number; body: ApiError };

function forbid(error: string, callerTier: AgentTrustTier, status = 403, code: ApiError['code'] = 'FORBIDDEN'): WebhookTrustPolicyDecision {
  return {
    allowed: false,
    callerTier,
    status,
    body: { error, code },
  };
}

export function evaluateWebhookManagementAccess(
  action: WebhookManagementAction,
  actor: WebhookTrustPolicyInput & { trust_policy?: unknown }
): WebhookTrustPolicyDecision {
  const callerTier = normalizeAgentTrustTier(actor.trust_tier);
  const policyDecision = evaluateWebhookPolicyAccess(actor);

  if (!policyDecision.allowed) {
    return {
      ...forbid(
        action === 'list'
          ? `${policyDecision.body?.error} External-tier agents cannot manage webhook endpoints until promoted to ${policyDecision.requiredTier}.`
          : `${policyDecision.body?.error} External-tier agents cannot ${action.replace('-', ' ')} webhook endpoints until promoted to ${policyDecision.requiredTier}.`,
        callerTier,
        policyDecision.status,
        policyDecision.body?.code,
      ),
      callerTier,
    };
  }

  return { allowed: true, callerTier };
}
