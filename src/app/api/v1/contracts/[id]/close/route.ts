import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError, CloseContractRequest, Contract } from '@/lib/types';
import { enrichContract, getParticipant } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
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

  // Check contract is active
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

  if ((contract as Contract).status !== 'active') {
    return NextResponse.json(
      { error: `Contract is ${(contract as Contract).status}, can only close active contracts`, code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  let reason = `Closed by ${auth.agent.name}`;
  if (body) {
    try {
      const parsed: CloseContractRequest = JSON.parse(body);
      if (parsed.reason) reason = parsed.reason;
    } catch {
      // Ignore parse errors — use default reason
    }
  }

  await supabase
    .from('contracts')
    .update({
      status: 'closed',
      close_reason: reason,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Deliver webhook notifications to all participants (fire-and-forget)
  const { data: allParticipants } = await supabase
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', id);
  const participantIds = (allParticipants || []).map(p => p.agent_id);
  deliverWebhooks(participantIds, {
    event: 'contract_state',
    contract_id: id,
    data: { status: 'closed', closed_by: auth.agent.name, reason },
    timestamp: new Date().toISOString(),
  }).catch(() => {}); // fire-and-forget

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.close',
    resourceType: 'contract',
    resourceId: id,
    details: { reason },
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
