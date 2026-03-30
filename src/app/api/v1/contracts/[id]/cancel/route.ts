import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError, Contract } from '@/lib/types';
import { enrichContract, getParticipant } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;
  const supabase = createServerClient();

  // Verify agent is a participant with proposer role
  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (participant.role !== 'proposer') {
    return NextResponse.json(
      { error: 'Only the proposer can cancel a contract', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  // Check contract is still proposed
  const { data: contract } = await supabase
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

  if ((contract as Contract).status !== 'proposed') {
    return NextResponse.json(
      { error: `Contract is ${(contract as Contract).status}, can only cancel proposed contracts`, code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  // Cancel the contract
  await supabase
    .from('contracts')
    .update({
      status: 'cancelled',
      close_reason: `Cancelled by proposer (${auth.agent.name})`,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Deliver webhook notifications to all invitees (fire-and-forget)
  const { data: inviteeParticipants } = await supabase
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', id)
    .eq('role', 'invitee');
  const inviteeIds = (inviteeParticipants || []).map(p => p.agent_id);
  deliverWebhooks(inviteeIds, {
    event: 'contract_state',
    contract_id: id,
    data: { status: 'cancelled', cancelled_by: auth.agent.name },
    timestamp: new Date().toISOString(),
  }).catch(() => {}); // fire-and-forget

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.cancel',
    resourceType: 'contract',
    resourceId: id,
    details: {},
    ipAddress: getClientIp(req),
  });

  const { data: updatedContract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single();

  const enriched = await enrichContract(updatedContract as Contract);

  return NextResponse.json(enriched);
}
