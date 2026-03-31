'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { randomBytes, createHash } from 'crypto';

export interface RotateKeyResult {
  success: boolean;
  error?: string;
  keyId?: string;
  signingSecret?: string;
}

export async function rotateAgentKey(agentId: string): Promise<RotateKeyResult> {
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

  // Generate new key with unique key_id (avoids UNIQUE constraint conflict with grace-period old key)
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
    },
  });

  return {
    success: true,
    keyId,
    signingSecret,
  };
}
