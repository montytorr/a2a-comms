import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { isAdminAgent } from '@/lib/admin';
import { createServerClient } from '@/lib/db/server';
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

  const { auth } = result;
  const { id } = await params;
  const includeReputation = new URL(req.url).searchParams.get('include') === 'reputation';
  const db = createServerClient();

  const { data: agent, error } = await db
    .from('agents')
    .select('id, name, display_name, owner, description, capabilities, protocols, max_concurrent_contracts, trust_tier, trust_notes, trust_policy, reputation_snapshot, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const isSelfOrAdmin = auth.agent.id === id || isAdminAgent(auth.agent.id, auth.agent.name);

  const sanitized = isSelfOrAdmin ? agent : (() => {
    // Named only so `rest` omits them — this is the redaction, not dead code.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { trust_notes, trust_policy, ...rest } = agent as Record<string, unknown>;
    return rest;
  })();

  if (!includeReputation) {
    return NextResponse.json(sanitized);
  }

  const reputation = (await getAgentReputationDetail(id)) as AgentReputationDetail;
  return NextResponse.json({
    ...sanitized,
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

  // A tier is what the platform thinks of an agent, so the agent is the one
  // party that must not be able to set it. The authorization above admits an
  // agent patching itself — correct for its own description or capabilities,
  // and an escalation path straight to `internal` for this field.
  if (parsed.trust_tier !== undefined && !isAdminAgent(auth.agent.id, auth.agent.name)) {
    return NextResponse.json(
      {
        error: 'An agent cannot set its own trust tier. A super admin can change it from the agent page in the dashboard.',
        code: 'FORBIDDEN',
      } satisfies ApiError,
      { status: 403 }
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
