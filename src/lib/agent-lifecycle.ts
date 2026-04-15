import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import { getReservedNames } from '@/lib/admin';
import { normalizeAgentTrustTier } from '@/lib/trust-tiers';
import { buildDefaultAgentTrustPolicyForTier, normalizeAgentTrustPolicy } from '@/lib/agent-trust-policy';
import { DEFAULT_AGENT_PRIVACY_METADATA, normalizeAgentPrivacyMetadata } from '@/lib/privacy-policy';
import type { Agent, AgentPrivacyMetadata } from '@/lib/types';

export class AgentLifecycleError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'AgentLifecycleError';
    this.code = code;
    this.status = status;
  }
}

export interface AgentLifecycleCreateInput {
  name: string;
  display_name: string;
  owner: string;
  owner_user_id?: string | null;
  description?: string | null;
  capabilities?: string[];
  protocols?: string[];
  max_concurrent_contracts?: number;
  trust_tier?: 'internal' | 'partner' | 'external' | null;
  trust_notes?: string | null;
  trust_policy?: Agent['trust_policy'];
  privacy_metadata?: AgentPrivacyMetadata | null;
  service_key?: {
    key_id?: string;
    label?: string | null;
    signing_secret?: string;
    human_owner?: string | null;
  };
}

export interface AgentLifecycleUpdateInput {
  capabilities?: string[];
  protocols?: string[];
  max_concurrent_contracts?: number;
  description?: string | null;
  trust_tier?: 'internal' | 'partner' | 'external';
  trust_notes?: string | null;
  trust_policy?: Agent['trust_policy'];
  privacy_metadata?: AgentPrivacyMetadata | null;
  deactivate?: boolean;
  deactivate_reason?: string | null;
}

function validateAgentIdentity(input: { name: string; display_name: string; owner: string }) {
  if (!input.name || !input.display_name || !input.owner) {
    throw new AgentLifecycleError('Missing required fields: name, display_name, owner', 'VALIDATION_ERROR', 400);
  }

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(input.name)) {
    throw new AgentLifecycleError(
      'Agent name must be a slug (lowercase letters, numbers, hyphens, underscores)',
      'VALIDATION_ERROR',
      400
    );
  }

  const reservedNames = getReservedNames();
  if (reservedNames.includes(input.name)) {
    throw new AgentLifecycleError(`Agent name "${input.name}" is reserved and cannot be registered`, 'RESERVED_NAME', 403);
  }
}

function normalizeCreatePayload(input: AgentLifecycleCreateInput) {
  validateAgentIdentity(input);

  const trustTier = normalizeAgentTrustTier(input.trust_tier);
  const privacyMetadata = input.privacy_metadata === undefined
    ? DEFAULT_AGENT_PRIVACY_METADATA
    : normalizeAgentPrivacyMetadata(input.privacy_metadata ?? null);

  return {
    name: input.name,
    display_name: input.display_name,
    owner: input.owner,
    owner_user_id: input.owner_user_id ?? null,
    description: input.description ?? null,
    capabilities: input.capabilities ?? [],
    protocols: input.protocols && input.protocols.length > 0 ? input.protocols : ['a2a-comms-v1'],
    max_concurrent_contracts: input.max_concurrent_contracts ?? 10,
    trust_tier: trustTier,
    trust_notes: input.trust_notes ?? null,
    trust_policy: input.trust_policy
      ? normalizeAgentTrustPolicy(input.trust_policy)
      : buildDefaultAgentTrustPolicyForTier(trustTier),
    privacy_metadata: privacyMetadata,
  };
}

export function buildAgentUpdateFields(input: AgentLifecycleUpdateInput): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  if (input.capabilities !== undefined) updates.capabilities = input.capabilities;
  if (input.protocols !== undefined) updates.protocols = input.protocols;
  if (input.max_concurrent_contracts !== undefined) updates.max_concurrent_contracts = input.max_concurrent_contracts;
  if (input.description !== undefined) updates.description = input.description;
  if (input.trust_tier !== undefined) updates.trust_tier = normalizeAgentTrustTier(input.trust_tier);
  if (input.trust_notes !== undefined) updates.trust_notes = input.trust_notes;
  if (input.trust_policy !== undefined) updates.trust_policy = normalizeAgentTrustPolicy(input.trust_policy);
  if (input.privacy_metadata !== undefined) updates.privacy_metadata = normalizeAgentPrivacyMetadata(input.privacy_metadata);

  return updates;
}

export async function createAgentWithServiceKey(input: AgentLifecycleCreateInput) {
  const supabase = createServerClient();
  const agentPayload = normalizeCreatePayload(input);

  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', agentPayload.name)
    .maybeSingle();

  if (existing) {
    throw new AgentLifecycleError(`Agent with name "${agentPayload.name}" already exists`, 'DUPLICATE', 409);
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert(agentPayload)
    .select('*')
    .single();

  if (agentError || !agent) {
    throw new AgentLifecycleError(agentError?.message || 'Failed to create agent', 'DB_ERROR', 500);
  }

  const keyId = input.service_key?.key_id || `${agentPayload.name}-prod`;
  const signingSecret = input.service_key?.signing_secret || crypto.randomBytes(32).toString('hex');
  const keyHash = crypto.createHash('sha256').update(signingSecret).digest('hex');

  const { data: existingKey } = await supabase
    .from('service_keys')
    .select('id')
    .eq('key_id', keyId)
    .maybeSingle();

  if (existingKey) {
    await supabase.from('agents').delete().eq('id', agent.id);
    throw new AgentLifecycleError(`Service key "${keyId}" already exists`, 'DUPLICATE_KEY', 409);
  }

  const { data: key, error: keyError } = await supabase
    .from('service_keys')
    .insert({
      key_id: keyId,
      key_hash: keyHash,
      signing_secret: signingSecret,
      agent_id: agent.id,
      human_owner: input.service_key?.human_owner ?? input.owner,
      label: input.service_key?.label ?? `${agentPayload.display_name} production key`,
      is_active: true,
    })
    .select('*')
    .single();

  if (keyError || !key) {
    await supabase.from('agents').delete().eq('id', agent.id);
    throw new AgentLifecycleError(keyError?.message || 'Failed to create service key', 'DB_ERROR', 500);
  }

  return {
    agent,
    serviceKey: {
      id: key.id,
      key_id: key.key_id,
      signing_secret: signingSecret,
      label: key.label,
      is_active: key.is_active,
    },
  };
}

export async function updateAgentLifecycle(agentId: string, input: AgentLifecycleUpdateInput) {
  const supabase = createServerClient();
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    throw new AgentLifecycleError('Agent not found', 'NOT_FOUND', 404);
  }

  const updates = buildAgentUpdateFields(input);

  if (input.deactivate) {
    updates.description = agent.description;
    updates.updated_at = new Date().toISOString();

    const deactivateReason = input.deactivate_reason?.trim() || 'Agent deactivated';
    const deactivatedCapabilities = Array.isArray(agent.capabilities) ? agent.capabilities.filter((cap: string) => cap !== 'active') : [];
    updates.capabilities = deactivatedCapabilities;

    const { error: deactivateKeysError } = await supabase
      .from('service_keys')
      .update({
        is_active: false,
        expires_at: new Date().toISOString(),
        rotated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId)
      .eq('is_active', true);

    if (deactivateKeysError) {
      throw new AgentLifecycleError(deactivateKeysError.message, 'DB_ERROR', 500);
    }

    await supabase.from('webhooks').delete().eq('agent_id', agentId);

    updates.trust_notes = [agent.trust_notes, deactivateReason].filter(Boolean).join('\n\n');
  }

  if (Object.keys(updates).length === 0) {
    throw new AgentLifecycleError('No valid fields to update', 'VALIDATION_ERROR', 400);
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', agentId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new AgentLifecycleError(updateError?.message || 'Failed to update agent', 'DB_ERROR', 500);
  }

  return updated;
}
