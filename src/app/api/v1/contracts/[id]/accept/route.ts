import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError, Contract } from '@/lib/types';
import { autoCloseIfExpired, enrichContract, getParticipant, activateIfAllAccepted } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { claimAcceptedHandoff } from '@/lib/handoff-resume';
import { getEscalationBrokerageProvenance, isLikelyBrokerContract } from '@/lib/escalation-brokerage';
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

  const policy = evaluateContractParticipantMutation('accept', participant);
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
  let brokerActivation: { projectId: string; taskId: string; runId: string | null } | null = null;

  // Deliver webhook notifications to all participants (fire-and-forget)
  if (activated) {
    if (isLikelyBrokerContract({ title: checked.title, description: checked.description } as never)) {
      const { data: linkedTaskRow } = await supabase
        .from('task_contracts')
        .select('task_id, task:tasks!task_contracts_task_id_fkey(id, project_id, active_run_id, assignee_agent_id, last_checkpoint_summary, last_checkpoint_payload)')
        .eq('contract_id', id)
        .limit(1)
        .maybeSingle();

      const linkedTask = Array.isArray(linkedTaskRow?.task) ? linkedTaskRow?.task[0] : linkedTaskRow?.task;
      if (linkedTask?.id && linkedTask?.project_id) {
        const activeRunId = linkedTask.active_run_id as string | null;
        const latestReason = checked.description || checked.title;
        if (activeRunId) {
          const { data: run } = await supabase
            .from('task_execution_runs')
            .select('*')
            .eq('id', activeRunId)
            .single();

          if (run) {
            const metadata = { ...(run.metadata || {}), broker_agent_id: auth.agent.id, broker_assigned_at: new Date().toISOString(), escalation_contract_id: id, broker_contract_id: id, collaboration_mode: 'brokered-collaboration', escalation_status: 'broker-engaged' };
            await supabase
              .from('task_execution_runs')
              .update({ metadata, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('id', activeRunId);
          }

          await supabase.from('task_execution_checkpoints').insert({
            run_id: activeRunId,
            task_id: linkedTask.id,
            project_id: linkedTask.project_id,
            agent_id: auth.agent.id,
            sequence: 999999,
            checkpoint_key: 'broker-engaged',
            summary: `Broker ${auth.agent.display_name || auth.agent.name} accepted escalation contract ${id}`,
            payload: {
              broker_agent_id: auth.agent.id,
              broker_assigned_at: new Date().toISOString(),
              escalation_contract_id: id,
              broker_contract_id: id,
              collaboration_mode: 'brokered-collaboration',
              escalation_status: 'broker-engaged',
              broker_note: latestReason,
            },
          });
        }

        await supabase.from('task_comments').insert({
          task_id: linkedTask.id,
          project_id: linkedTask.project_id,
          author_agent_id: auth.agent.id,
          author_name: auth.agent.display_name || auth.agent.name,
          content: `Accepted escalation contract \`${id}\` as broker/mediator. Execution ownership stays explicit while broker intervention proceeds.`,
          comment_type: 'system',
          metadata: {
            escalation_contract_id: id,
            broker_agent_id: auth.agent.id,
            collaboration_mode: 'brokered-collaboration',
            escalation_status: 'broker-engaged',
          },
        });

        brokerActivation = { projectId: linkedTask.project_id, taskId: linkedTask.id, runId: activeRunId };
      }
    } else {
      handoffClaim = await claimAcceptedHandoff({
        contract: checked,
        acceptedByAgentId: auth.agent.id,
        acceptedByAgentName: auth.agent.name,
        acceptedByAgentDisplayName: auth.agent.display_name || null,
      }).catch(() => null);
    }

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
        broker_engaged: !!brokerActivation,
        resumed_run_id: handoffClaim?.newRun.id ?? brokerActivation?.runId ?? null,
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
      broker_engaged: !!brokerActivation,
      task_id: handoffClaim?.taskId ?? brokerActivation?.taskId ?? null,
      resumed_run_id: handoffClaim?.newRun.id ?? brokerActivation?.runId ?? null,
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
