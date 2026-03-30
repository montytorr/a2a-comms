'use server';

import { createServerClient } from '@/lib/supabase/server';
import { randomBytes, createHash } from 'crypto';

export interface RotateKeyResult {
  success: boolean;
  error?: string;
  keyId?: string;
  signingSecret?: string;
}

export async function rotateAgentKey(agentId: string): Promise<RotateKeyResult> {
  const supabase = createServerClient();

  // Verify agent exists
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return { success: false, error: 'Agent not found' };
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
  const keyId = `${agent.name}-prod`;
  const signingSecret = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(signingSecret).digest('hex');

  const { error: keyError } = await supabase.from('service_keys').insert({
    key_id: keyId,
    key_hash: keyHash,
    agent_id: agentId,
    label: `${agent.display_name} production key (rotated)`,
    is_active: true,
  });

  if (keyError) {
    return { success: false, error: `Failed to create new key: ${keyError.message}` };
  }

  // Audit log
  await supabase.from('audit_log').insert({
    actor: 'operator',
    action: 'key.rotate',
    resource_type: 'agent',
    resource_id: agentId,
    details: {
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
