'use server';

import { createServerClient } from '@/lib/db/server';
import { getAuthUser } from '@/lib/auth-context';
import { randomBytes, createHash } from 'crypto';
import { requestApproval, consumeApproval } from '@/lib/approvals';
import { revalidatePath } from 'next/cache';
import { auditLog } from '@/lib/api-helpers';
import { updateAgentLifecycle, AgentLifecycleError, type AgentLifecycleUpdateInput } from '@/lib/agent-lifecycle';
import { isAgentTrustTier } from '@/lib/trust-tiers';

export interface RotateKeyResult {
  success: boolean;
  error?: string;
  keyId?: string;
  signingSecret?: string;
  approvalRequired?: boolean;
  approvalId?: string;
}

/**
 * Request approval to rotate an agent's key.
 * Key rotation is a sensitive operation that requires approval from another super_admin.
 */
export async function requestKeyRotation(agentId: string): Promise<RotateKeyResult> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const db = createServerClient();

  // Verify agent exists
  const { data: agent, error: agentError } = await db
    .from('agents')
    .select('id, name, display_name, owner_user_id')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return { success: false, error: 'Agent not found' };
  }

  // Verify ownership: must be admin or own the agent
  if (!user.isSuperAdmin && agent.owner_user_id !== user.id) {
    return { success: false, error: 'You can only rotate keys for your own agents' };
  }

  const { id } = await requestApproval({
    action: 'key.rotate',
    actor: user.displayName,
    details: {
      agent_id: agentId,
      agent_name: agent.name,
      user_id: user.id,
    },
  });

  return {
    success: true,
    approvalRequired: true,
    approvalId: id,
  };
}

/**
 * Execute key rotation after approval.
 */
export async function executeKeyRotation(agentId: string, approvalId: string): Promise<RotateKeyResult> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Atomically consume the approval (one-time use, prevents replay)
  const approval = await consumeApproval(approvalId, user.displayName);
  if (!approval) {
    return { success: false, error: 'No approved key rotation request found (may have been already used)' };
  }

  // Verify the approval is actually for key rotation
  if (approval.action !== 'key.rotate') {
    return { success: false, error: 'Approval is not for key rotation' };
  }

  const db = createServerClient();

  // Verify agent exists
  const { data: agent, error: agentError } = await db
    .from('agents')
    .select('id, name, display_name, owner_user_id')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return { success: false, error: 'Agent not found' };
  }

  // Verify ownership
  if (!user.isSuperAdmin && agent.owner_user_id !== user.id) {
    return { success: false, error: 'You can only rotate keys for your own agents' };
  }

  // Find current active key
  const { data: currentKeys } = await db
    .from('service_keys')
    .select('id, key_id')
    .eq('agent_id', agentId)
    .eq('is_active', true);

  // Set old keys to expire in 1 hour
  if (currentKeys && currentKeys.length > 0) {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    for (const key of currentKeys) {
      await db
        .from('service_keys')
        .update({
          expires_at: expiresAt,
          rotated_at: new Date().toISOString(),
        })
        .eq('id', key.id);
    }
  }

  // Generate new key
  const keyId = `${agent.name}-${Date.now().toString(36)}`;
  const signingSecret = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(signingSecret).digest('hex');

  const { error: keyError } = await db.from('service_keys').insert({
    key_id: keyId,
    key_hash: keyHash,
    signing_secret: signingSecret,
    agent_id: agentId,
    label: `${agent.display_name} production key (rotated)`,
    is_active: true,
  });

  if (keyError) {
    return { success: false, error: `Failed to create new key: ${keyError.message}` };
  }

  // Audit log
  await db.from('audit_log').insert({
    actor: user.id,
    action: 'key.rotate',
    resource_type: 'agent',
    resource_id: agentId,
    details: {
      actor_name: user.displayName,
      agent_name: agent.name,
      new_key_id: keyId,
      old_keys_expiring: currentKeys?.map((k) => k.key_id) || [],
      approval_id: approvalId,
    },
  });

  return {
    success: true,
    keyId,
    signingSecret,
  };
}

/**
 * Legacy direct rotation — kept for API route compatibility.
 * Dashboard UI should use requestKeyRotation + executeKeyRotation flow.
 */
export async function rotateAgentKey(agentId: string): Promise<RotateKeyResult> {
  return requestKeyRotation(agentId);
}

/**
 * Trust, trust-policy and privacy edits from the dashboard.
 *
 * These existed as buttons long before they existed as actions: the three
 * controls on this page each did a browser `fetch('/api/v1/agents/:id')`, and
 * `/api/v1/*` is HMAC-service-key only with no session path, so every save
 * could only ever 401. The control rendered, accepted input, showed the new
 * value, and silently discarded it. They are server actions now, authorized by
 * the same rule the page uses to decide whether to render them at all.
 */
type AgentEditResult = { success: boolean; error?: string };

async function requireAgentEditor(agentId: string) {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');

  const db = createServerClient();
  const { data: agent, error } = await db
    .from('agents')
    .select('id, name, owner_user_id')
    .eq('id', agentId)
    .single();

  if (error || !agent) throw new Error('Agent not found');

  // Same predicate as agents/[id]/page.tsx computes for `canEdit`. An agent's
  // tier is a judgement made ABOUT it, so it is never self-service.
  if (!user.isSuperAdmin && agent.owner_user_id !== user.id) {
    throw new Error('Only the agent owner or a super admin can change this');
  }

  return { user, agent };
}

function toEditResult(error: unknown): AgentEditResult {
  if (error instanceof AgentLifecycleError) return { success: false, error: error.message };
  return { success: false, error: error instanceof Error ? error.message : 'Update failed' };
}

export async function updateAgentTrustControls(
  agentId: string,
  input: { trust_tier: string; trust_notes: string | null }
): Promise<AgentEditResult> {
  try {
    const { user } = await requireAgentEditor(agentId);

    if (!isAgentTrustTier(input.trust_tier)) {
      return { success: false, error: 'Invalid trust tier. Must be one of: internal, partner, external' };
    }

    await updateAgentLifecycle(agentId, {
      trust_tier: input.trust_tier,
      trust_notes: input.trust_notes,
    });

    await auditLog({
      actor: user.displayName,
      action: 'agent.trust_tier_change',
      resourceType: 'agent',
      resourceId: agentId,
      details: { trust_tier: input.trust_tier, changed_by_user: user.id },
    });

    revalidatePath(`/agents/${agentId}`);
    return { success: true };
  } catch (error) {
    return toEditResult(error);
  }
}

export async function updateAgentTrustPolicy(
  agentId: string,
  trustPolicy: AgentLifecycleUpdateInput['trust_policy']
): Promise<AgentEditResult> {
  try {
    const { user } = await requireAgentEditor(agentId);

    await updateAgentLifecycle(agentId, { trust_policy: trustPolicy });

    await auditLog({
      actor: user.displayName,
      action: 'agent.trust_policy_change',
      resourceType: 'agent',
      resourceId: agentId,
      details: { changed_by_user: user.id },
    });

    revalidatePath(`/agents/${agentId}`);
    return { success: true };
  } catch (error) {
    return toEditResult(error);
  }
}

