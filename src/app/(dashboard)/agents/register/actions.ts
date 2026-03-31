'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { randomBytes, createHash } from 'crypto';

export interface RegisterAgentResult {
  success: boolean;
  error?: string;
  agentId?: string;
  keyId?: string;
  signingSecret?: string;
}

export async function registerAgent(formData: FormData): Promise<RegisterAgentResult> {
  const user = await getAuthUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const name = (formData.get('name') as string)?.trim();
  const displayName = (formData.get('display_name') as string)?.trim();
  const owner = (formData.get('owner') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;
  const capabilitiesRaw = (formData.get('capabilities') as string)?.trim() || '';
  const protocolsRaw = (formData.get('protocols') as string)?.trim() || '';
  const maxConcurrent = parseInt(formData.get('max_concurrent_contracts') as string) || 5;

  // Validation
  if (!name || !displayName || !owner) {
    return { success: false, error: 'Name, display name, and owner are required.' };
  }

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
    return { success: false, error: 'Name must be a slug (lowercase letters, numbers, hyphens, underscores).' };
  }

  const capabilities = capabilitiesRaw
    ? capabilitiesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const protocols = protocolsRaw
    ? protocolsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const supabase = createServerClient();

  // Check for duplicate name
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', name)
    .single();

  if (existing) {
    return { success: false, error: `Agent "${name}" already exists.` };
  }

  // Create agent — automatically link to current user
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert({
      name,
      display_name: displayName,
      owner,
      owner_user_id: user.id,
      description,
      capabilities,
      protocols,
      max_concurrent_contracts: maxConcurrent,
    })
    .select('id')
    .single();

  if (agentError || !agent) {
    return { success: false, error: `Failed to create agent: ${agentError?.message || 'Unknown error'}` };
  }

  // Generate service key
  const keyId = `${name}-prod`;
  const signingSecret = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(signingSecret).digest('hex');

  const { error: keyError } = await supabase.from('service_keys').insert({
    key_id: keyId,
    key_hash: keyHash,
    signing_secret: signingSecret,
    agent_id: agent.id,
    label: `${displayName} production key`,
    is_active: true,
  });

  if (keyError) {
    // Rollback agent creation
    await supabase.from('agents').delete().eq('id', agent.id);
    return { success: false, error: `Failed to create service key: ${keyError.message}` };
  }

  // Audit log
  await supabase.from('audit_log').insert({
    actor: user.displayName || 'operator',
    action: 'agent.register',
    resource_type: 'agent',
    resource_id: agent.id,
    details: { name, display_name: displayName, owner, key_id: keyId, registered_by: user.email },
  });

  return {
    success: true,
    agentId: agent.id,
    keyId,
    signingSecret,
  };
}
