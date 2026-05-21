import { createServerClient } from '@/lib/supabase/server';
import { auditLog } from '@/lib/api-helpers';
import { evaluateContractCollaboration, type TrustPolicyAgent } from '@/lib/trust-tiers';
import { enrichContract } from '@/app/api/v1/contracts/_helpers';
import type { ApiError, ContractResponse, ProposeContractRequest } from '@/lib/types';

export interface ContractProposalActor extends TrustPolicyAgent {
  display_name?: string | null;
  max_concurrent_contracts?: number | null;
}

export class ContractProposalError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}

export async function createContractProposal(params: {
  actor: ContractProposalActor;
  request: ProposeContractRequest;
  ipAddress?: string;
  auditActor?: string;
  skipNotifications?: boolean;
}): Promise<{ contract: ContractResponse; inviteeOwnerIds: string[]; contractId: string }> {
  const { actor, request, ipAddress, auditActor } = params;
  const parsed = request;

  if (!parsed.title || !Array.isArray(parsed.invitees) || parsed.invitees.length === 0) {
    throw new ContractProposalError(400, {
      error: 'Missing required fields: title, invitees (non-empty array)',
      code: 'VALIDATION_ERROR',
    });
  }

  const normalizedInvitees = Array.from(
    new Set(parsed.invitees.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))
  );
  const normalizedObservers = Array.from(
    new Set((parsed.observers || []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))
  );

  if (normalizedInvitees.length === 0) {
    throw new ContractProposalError(400, {
      error: 'Missing required fields: title, invitees (non-empty array)',
      code: 'VALIDATION_ERROR',
    });
  }

  const maxTurns = parsed.max_turns ?? 50;
  const expiresInHours = parsed.expires_in_hours ?? 168;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const supabase = createServerClient();
  const requestedAgentNames = Array.from(new Set([...normalizedInvitees, ...normalizedObservers]));

  const { data: requestedAgents, error: requestedAgentsError } = await supabase
    .from('agents')
    .select('id, name, display_name, max_concurrent_contracts, owner_user_id, trust_tier')
    .in('name', requestedAgentNames);

  if (requestedAgentsError) {
    throw new ContractProposalError(500, {
      error: 'Failed to validate participants',
      code: 'DB_ERROR',
    });
  }

  const agentByName = new Map((requestedAgents || []).map((agent) => [agent.name, agent]));
  const missingInvitees = normalizedInvitees.filter((n) => !agentByName.has(n));
  const missingObservers = normalizedObservers.filter((n) => !agentByName.has(n));
  if (missingInvitees.length > 0 || missingObservers.length > 0) {
    const parts = [] as string[];
    if (missingInvitees.length > 0) parts.push(`unknown invitee(s): ${missingInvitees.join(', ')}`);
    if (missingObservers.length > 0) parts.push(`unknown observer(s): ${missingObservers.join(', ')}`);
    throw new ContractProposalError(400, { error: parts.join('; '), code: 'INVALID_INVITEES' });
  }

  if (normalizedInvitees.includes(actor.name) || normalizedObservers.includes(actor.name)) {
    throw new ContractProposalError(400, {
      error: 'Cannot add yourself as an invitee or observer on the same contract',
      code: 'VALIDATION_ERROR',
    });
  }

  const overlap = normalizedObservers.filter((name) => normalizedInvitees.includes(name));
  if (overlap.length > 0) {
    throw new ContractProposalError(400, {
      error: `Agents cannot be both invitees and observers on the same contract: ${overlap.join(', ')}`,
      code: 'VALIDATION_ERROR',
    });
  }

  const inviteeAgents = normalizedInvitees.map((name) => agentByName.get(name)).filter((agent): agent is NonNullable<typeof agent> => !!agent);
  const observerAgents = normalizedObservers.map((name) => agentByName.get(name)).filter((agent): agent is NonNullable<typeof agent> => !!agent);

  const trustGate = evaluateContractCollaboration(actor, inviteeAgents, observerAgents);
  if (!trustGate.allowed) {
    throw new ContractProposalError(403, {
      error: trustGate.reason || 'Participant trust tier blocks contract proposal',
      code: 'TRUST_TIER_BLOCKED',
    });
  }

  const { data: actorParticipantRows } = await supabase
    .from('contract_participants')
    .select('contract_id')
    .eq('agent_id', actor.id);

  const { data: actorActiveContracts } = await supabase
    .from('contracts')
    .select('id')
    .in('status', ['active', 'proposed'])
    .in('id', (actorParticipantRows || []).map((row) => row.contract_id));

  const currentActive = actorActiveContracts?.length || 0;
  if (actor.max_concurrent_contracts && currentActive >= actor.max_concurrent_contracts) {
    throw new ContractProposalError(409, {
      error: `Proposer ${actor.name} has reached max concurrent active contracts (${actor.max_concurrent_contracts})`,
      code: 'MAX_CONTRACTS_REACHED',
    });
  }

  for (const invitee of inviteeAgents) {
    if (!invitee.max_concurrent_contracts) continue;
    const { data: inviteeParticipantRows } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .eq('agent_id', invitee.id);

    const { data: inviteeContracts } = await supabase
      .from('contracts')
      .select('id')
      .in('status', ['active', 'proposed'])
      .in('id', (inviteeParticipantRows || []).map((row) => row.contract_id));

    if ((inviteeContracts?.length || 0) >= invitee.max_concurrent_contracts) {
      throw new ContractProposalError(409, {
        error: `Invitee ${invitee.name} has reached max concurrent active contracts (${invitee.max_concurrent_contracts})`,
        code: 'MAX_CONTRACTS_REACHED',
      });
    }
  }

  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .insert({
      title: parsed.title,
      description: parsed.description || null,
      status: 'proposed',
      proposer_id: actor.id,
      max_turns: maxTurns,
      current_turns: 0,
      expires_at: expiresAt,
      message_schema: parsed.message_schema || null,
    })
    .select()
    .single();

  if (contractErr || !contract) {
    throw new ContractProposalError(500, {
      error: 'Failed to create contract',
      code: 'DB_ERROR',
    });
  }

  // Re-check max-concurrent after insert (CAS guard against race conditions).
  // Another proposal may have been inserted between the count check and our insert.
  const { data: postInsertParticipantRows } = await supabase
    .from('contract_participants')
    .select('contract_id')
    .eq('agent_id', actor.id);

  const { data: postInsertActiveContracts } = await supabase
    .from('contracts')
    .select('id')
    .in('status', ['active', 'proposed'])
    .in('id', (postInsertParticipantRows || []).map((row) => row.contract_id));

  const postInsertCount = postInsertActiveContracts?.length || 0;
  if (actor.max_concurrent_contracts && postInsertCount > actor.max_concurrent_contracts) {
    await supabase.from('contracts').delete().eq('id', contract.id);
    throw new ContractProposalError(409, {
      error: `Proposer ${actor.name} has reached max concurrent active contracts (${actor.max_concurrent_contracts})`,
      code: 'MAX_CONTRACTS_REACHED',
    });
  }

  const participants = [
    {
      contract_id: contract.id,
      agent_id: actor.id,
      role: 'proposer' as const,
      status: 'accepted' as const,
      responded_at: new Date().toISOString(),
    },
    ...inviteeAgents.map((a) => ({
      contract_id: contract.id,
      agent_id: a.id,
      role: 'invitee' as const,
      status: 'pending' as const,
      responded_at: null,
    })),
    ...observerAgents.map((a) => ({
      contract_id: contract.id,
      agent_id: a.id,
      role: 'observer' as const,
      status: 'accepted' as const,
      responded_at: new Date().toISOString(),
    })),
  ];

  const { error: partInsertErr } = await supabase.from('contract_participants').insert(participants);
  if (partInsertErr) {
    await supabase.from('contracts').delete().eq('id', contract.id);
    throw new ContractProposalError(500, {
      error: 'Failed to create participants',
      code: 'DB_ERROR',
    });
  }

  await auditLog({
    actor: auditActor || actor.name,
    action: 'contract.propose',
    resourceType: 'contract',
    resourceId: contract.id,
    details: {
      title: parsed.title,
      invitees: normalizedInvitees,
      observers: normalizedObservers,
      max_turns: maxTurns,
      expires_in_hours: expiresInHours,
    },
    ipAddress,
  });

  let enriched: ContractResponse;
  try {
    enriched = await enrichContract(contract);
  } catch (enrichErr) {
    await supabase.from('contract_participants').delete().eq('contract_id', contract.id);
    await supabase.from('contracts').delete().eq('id', contract.id);
    throw new ContractProposalError(500, {
      error: 'Failed to enrich contract after creation',
      code: 'DB_ERROR',
    });
  }

  return {
    contract: enriched,
    inviteeOwnerIds: inviteeAgents.map((agent) => agent.owner_user_id).filter((value): value is string => !!value),
    contractId: contract.id,
  };
}
