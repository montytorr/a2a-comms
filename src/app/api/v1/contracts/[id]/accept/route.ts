import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError, Contract } from '@/lib/types';
import { autoCloseIfExpired, enrichContract, getParticipant, activateIfAllAccepted } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { claimAcceptedHandoff } from '@/lib/handoff-resume';

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

  // Must be an invitee with pending status
  if (participant.role !== 'invitee') {
    return NextResponse.json(
      { error: 'Only invitees can accept contracts', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (participant.status !== 'pending') {
    return NextResponse.json(
      { error: `Already responded: ${participant.status}`, code: 'ALREADY_RESPONDED' } satisfies ApiError,
      { status: 409 }
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

  const checked = await autoCloseIfExpired(contract as Contract);
  if (checked.status !== 'proposed') {
    return NextResponse.json(
      { error: `Contract is ${checked.status}, cannot accept`, code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  // Update participant status
  await supabase
    .from('contract_participants')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    })
    .eq('contract_id', id)
    .eq('agent_id', auth.agent.id);

  // Check if all participants accepted → activate
  const activated = await activateIfAllAccepted(id);

  let handoffClaim: Awaited<ReturnType<typeof claimAcceptedHandoff>> = null;

  // Deliver webhook notifications to all participants (fire-and-forget)
  if (activated) {
    handoffClaim = await claimAcceptedHandoff({
      contract: checked,
      acceptedByAgentId: auth.agent.id,
      acceptedByAgentName: auth.agent.name,
      acceptedByAgentDisplayName: auth.agent.display_name || null,
    }).catch(() => null);

    const { data: allParticipants } = await supabase
      .from('contract_participants')
      .select('agent_id')
      .eq('contract_id', id);
    const participantIds = (allParticipants || []).map(p => p.agent_id);
    deliverWebhooks(participantIds, {
      event: 'contract.accepted',
      contract_id: id,
      project_id: handoffClaim?.projectId,
      task_id: handoffClaim?.taskId,
      data: {
        status: 'active',
        accepted_by: auth.agent.name,
        handoff_claimed: !!handoffClaim,
        resumed_run_id: handoffClaim?.newRun.id ?? null,
        resumed_from_run_id: handoffClaim?.previousRunId ?? null,
        resumed_from_checkpoint_id: handoffClaim?.resumedFromCheckpoint?.id ?? null,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.accept',
    resourceType: 'contract',
    resourceId: id,
    details: {
      activated,
      handoff_claimed: !!handoffClaim,
      task_id: handoffClaim?.taskId ?? null,
      resumed_run_id: handoffClaim?.newRun.id ?? null,
      resumed_from_run_id: handoffClaim?.previousRunId ?? null,
    },
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
