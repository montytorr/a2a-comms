import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/db/server';
import type { ApiError, CloseContractRequest, Contract } from '@/lib/types';
import { enrichContract, getParticipant } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { emitContractClosed } from '@/lib/contract-closure';
import { evaluateContractParticipantMutation } from '@/lib/contract-trust-policy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;
  const db = createServerClient();

  // Verify agent is a participant
  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const policy = evaluateContractParticipantMutation('close', participant);
  if (!policy.allowed) {
    return NextResponse.json(policy.body satisfies ApiError, { status: policy.status });
  }

  // Check contract is active
  const { data: contract } = await db
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single();

  if (!contract) {
    return NextResponse.json(
      { error: 'Contract not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if ((contract as Contract).status !== 'active') {
    return NextResponse.json(
      { error: `Contract is ${(contract as Contract).status}, can only close active contracts`, code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  // Exhausting a turn budget, or a participant deciding they are finished, is
  // not the same as the proposer accepting the work. While the gate is open the
  // contract cannot be closed at all - the proposer records an approval first,
  // which closes it if the budget is already spent.
  const gated = contract as Contract;
  if (gated.completion_requires_approval && !gated.completion_approved_at) {
    return NextResponse.json(
      {
        error:
          'This contract requires proposer approval before it can be closed. The proposer must send an approval message first.',
        code: 'COMPLETION_APPROVAL_REQUIRED',
      } satisfies ApiError,
      { status: 409 }
    );
  }

  let reason = `Closed by ${auth.agent.name}`;
  if (body) {
    let parsed: CloseContractRequest;
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
        { status: 400 }
      );
    }
    if (parsed.reason) reason = parsed.reason;
  }

  const { data: updated } = await db
    .from('contracts')
    .update({
      status: 'closed',
      close_reason: reason,
      // Recorded separately from the reason, which a caller-supplied
      // `reason` in the request body is free to replace.
      closed_by: auth.agent.name,
      closed_by_kind: 'agent',
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'active')
    .select()
    .maybeSingle();

  if (!updated) {
    return NextResponse.json(
      { error: 'Contract state changed concurrently', code: 'CONFLICT' } satisfies ApiError,
      { status: 409 }
    );
  }

  // Deliver webhook notifications to all participants (fire-and-forget)
  const { data: allParticipants } = await db
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', id);
  const participantIds = (allParticipants || []).map(p => p.agent_id);
  deliverWebhooks(participantIds, {
    event: 'contract.closed',
    contract_id: id,
    data: { status: 'closed', closed_by: auth.agent.name, reason },
    timestamp: new Date().toISOString(),
  }).catch(() => {}); // fire-and-forget

  // The same closure in the canonical shape every other path now emits, so a
  // consumer can reconcile on `outcome` without special-casing who closed it.
  emitContractClosed({
    contractId: id,
    status: 'closed',
    closedBy: auth.agent.name,
    closedByKind: 'agent',
    reason,
    currentTurns: gated.current_turns,
    maxTurns: gated.max_turns,
    completionApprovedAt: gated.completion_approved_at,
  }).catch(() => {});

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.close',
    resourceType: 'contract',
    resourceId: id,
    details: { reason },
    ipAddress: getClientIp(req),
  });

  const { data: updatedContract } = await db
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single();

  const enriched = await enrichContract(updatedContract as Contract, { viewerAgentId: auth.agent.id });

  return NextResponse.json(enriched);
}
