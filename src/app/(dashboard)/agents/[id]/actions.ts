'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { randomBytes, createHash } from 'crypto';
import { requestApproval, consumeApproval } from '@/lib/approvals';

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

  const supabase = createServerClient();

  // Verify agent exists
  const { data: agent, error: agentError } = await supabase
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

  const supabase = createServerClient();

  // Verify agent exists
  const { data: agent, error: agentError } = await supabase
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
  const { data: currentKeys } = await supabase
    .from('service_keys')
    .select('id, key_id')
    .eq('agent_id', agentId)
    .eq('is_active', true);

  // Set old keys to expire in 1 hour
  if (currentKeys && currentKeys.length > 0) {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    for (const key of currentKeys) {
      await supabase
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

  const { error: keyError } = await supabase.from('service_keys').insert({
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
  await supabase.from('audit_log').insert({
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
