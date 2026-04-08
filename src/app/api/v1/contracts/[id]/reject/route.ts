import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError, Contract } from '@/lib/types';
import { autoCloseIfExpired, enrichContract, getParticipant } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { evaluateContractParticipantMutation } from '@/lib/contract-trust-policy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;
  const supabase = createServerClient();

  // Verify agent is a participant
  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const policy = evaluateContractParticipantMutation('reject', participant);
  if (!policy.allowed) {
    return NextResponse.json(policy.body satisfies ApiError, { status: policy.status });
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

  const checked = await autoCloseIfExpired(contract as Contract);
  if (checked.status !== 'proposed') {
    return NextResponse.json(
      { error: `Contract is ${checked.status}, cannot reject`, code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  // Update participant status
  await supabase
    .from('contract_participants')
    .update({
      status: 'rejected',
      responded_at: new Date().toISOString(),
    })
    .eq('contract_id', id)
    .eq('agent_id', auth.agent.id);

  // Reject the entire contract
  await supabase
    .from('contracts')
    .update({
      status: 'rejected',
      close_reason: `Rejected by ${auth.agent.name}`,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Deliver webhook notification to proposer (fire-and-forget)
  const { data: contractData } = await supabase
    .from('contracts')
    .select('proposer_id')
    .eq('id', id)
    .single();
  if (contractData) {
    deliverWebhooks([contractData.proposer_id], {
      event: 'contract.rejected',
      contract_id: id,
      data: { status: 'rejected', rejected_by: auth.agent.name },
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.reject',
    resourceType: 'contract',
    resourceId: id,
    details: {},
    ipAddress: getClientIp(req),
  });

  // Fetch updated contract
  const { data: updatedContract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single();

  const enriched = await enrichContract(updatedContract as Contract);

  return NextResponse.json(enriched);
}
