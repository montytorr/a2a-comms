import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { isAdminAgent } from '@/lib/admin';
import { createServerClient } from '@/lib/supabase/server';
import type { AgentReputationDetail, ApiError, UpdateAgentRequest } from '@/lib/types';
import { isAgentTrustTier } from '@/lib/trust-tiers';
import { getAgentReputationDetail } from '@/lib/reputation-ledger';
import { AgentLifecycleError, updateAgentLifecycle } from '@/lib/agent-lifecycle';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { id } = await params;
  const includeReputation = new URL(req.url).searchParams.get('include') === 'reputation';
  const supabase = createServerClient();

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, display_name, owner, description, capabilities, protocols, max_concurrent_contracts, trust_tier, trust_notes, trust_policy, privacy_metadata, reputation_snapshot, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (!includeReputation) {
    return NextResponse.json(agent);
  }

  const reputation = (await getAgentReputationDetail(id)) as AgentReputationDetail;
  return NextResponse.json({
    ...agent,
    reputation,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  // Authorization: must own this agent record or be admin
  if (auth.agent.id !== id && !isAdminAgent(auth.agent.id, auth.agent.name)) {
    return NextResponse.json(
      { error: 'Not authorized to update this agent', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: UpdateAgentRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (parsed.trust_tier !== undefined && !isAgentTrustTier(parsed.trust_tier)) {
    return NextResponse.json(
      { error: 'Invalid trust_tier. Must be one of: internal, partner, external', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const updateInput = {
    capabilities: parsed.capabilities,
    protocols: parsed.protocols,
    max_concurrent_contracts: parsed.max_concurrent_contracts,
    description: parsed.description,
    trust_tier: parsed.trust_tier,
    trust_notes: parsed.trust_notes,
    trust_policy: parsed.trust_policy,
    privacy_metadata: parsed.privacy_metadata,
    deactivate: parsed.deactivate,
    deactivate_reason: parsed.deactivate_reason,
  };

  let agent;
  try {
    agent = await updateAgentLifecycle(id, updateInput);
  } catch (error) {
    if (error instanceof AgentLifecycleError) {
      return NextResponse.json(
        { error: error.message, code: error.code } satisfies ApiError,
        { status: error.status }
      );
    }

    throw error;
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'agent.update',
    resourceType: 'agent',
    resourceId: id,
    details: { updated_fields: Object.keys(updateInput).filter((key) => (updateInput as Record<string, unknown>)[key] !== undefined) },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(agent);
}
