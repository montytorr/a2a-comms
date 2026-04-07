import { createServerClient } from '@/lib/supabase/server';
import { appendTaskCheckpoint, createTaskExecutionRun, getLatestTaskCheckpoint, type TaskExecutionCheckpointRow, type TaskExecutionRunRow } from '@/lib/task-execution';
import type { Contract } from '@/lib/types';

export interface HandoffTaskContext {
  taskId: string;
  projectId: string;
  title: string;
  assigneeAgentId: string | null;
  activeRunId: string | null;
  executionStatus: string | null;
  lastCheckpointSummary: string | null;
  lastCheckpointPayload: Record<string, unknown> | null;
}

export interface ClaimHandoffResult {
  taskId: string;
  projectId: string;
  claimedByAgentId: string;
  priorAssigneeAgentId: string | null;
  previousRunId: string | null;
  resumedFromCheckpoint: TaskExecutionCheckpointRow | null;
  newRun: TaskExecutionRunRow;
}

export async function getLinkedTaskForContract(contractId: string): Promise<HandoffTaskContext | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('task_contracts')
    .select('task:tasks!task_contracts_task_id_fkey(id, project_id, title, assignee_agent_id, active_run_id, execution_status, last_checkpoint_summary, last_checkpoint_payload)')
    .eq('contract_id', contractId)
    .limit(1)
    .maybeSingle();

  const task = Array.isArray(data?.task) ? data?.task[0] : data?.task;
  return task || null;
}

export async function claimAcceptedHandoff(params: {
  contract: Contract;
  acceptedByAgentId: string;
  acceptedByAgentName: string;
  acceptedByAgentDisplayName?: string | null;
}): Promise<ClaimHandoffResult | null> {
  const task = await getLinkedTaskForContract(params.contract.id);
  if (!task) return null;

  const supabase = createServerClient();
  const actorLabel = params.acceptedByAgentDisplayName || params.acceptedByAgentName;
  const latestCheckpoint = task.activeRunId ? await getLatestTaskCheckpoint(task.id, task.activeRunId).catch(() => null) : null;

  const newRun = await createTaskExecutionRun({
    taskId: task.id,
    projectId: task.project_id,
    agentId: params.acceptedByAgentId,
    status: 'starting',
    summary: latestCheckpoint?.summary || task.lastCheckpointSummary || `Claimed handoff contract ${params.contract.id}`,
    metadata: {
      handoff_contract_id: params.contract.id,
      resumed_from_run_id: task.activeRunId,
      resumed_from_checkpoint_id: latestCheckpoint?.id ?? null,
      resumed_from_checkpoint_key: latestCheckpoint?.checkpoint_key ?? null,
      claimed_from_agent_id: task.assignee_agent_id,
      claim_type: 'handoff-accept',
    },
  });

  const checkpointPayload = {
    contract_id: params.contract.id,
    resumed_from_run_id: task.activeRunId,
    resumed_from_checkpoint_id: latestCheckpoint?.id ?? null,
    resumed_from_checkpoint_key: latestCheckpoint?.checkpoint_key ?? null,
    resumed_from_summary: latestCheckpoint?.summary ?? task.lastCheckpointSummary ?? null,
    resumed_from_payload: latestCheckpoint?.payload ?? task.lastCheckpointPayload ?? {},
    prior_assignee_agent_id: task.assignee_agent_id,
    claimed_by_agent_id: params.acceptedByAgentId,
  };

  await appendTaskCheckpoint({
    runId: newRun.id,
    taskId: task.id,
    projectId: task.project_id,
    agentId: params.acceptedByAgentId,
    checkpointKey: 'handoff-claimed',
    summary: `Claimed handoff from contract ${params.contract.id}`,
    payload: checkpointPayload,
    attachmentIds: latestCheckpoint?.attachment_ids ?? [],
  });

  await supabase
    .from('tasks')
    .update({
      assignee_agent_id: params.acceptedByAgentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .eq('project_id', task.project_id);

  await supabase.from('task_comments').insert([
    {
      task_id: task.id,
      project_id: task.project_id,
      author_agent_id: params.acceptedByAgentId,
      author_name: actorLabel,
      content: `Claimed handoff contract \`${params.contract.id}\` and resumed ownership of this task.`,
      comment_type: 'system',
      metadata: {
        handoff_contract_id: params.contract.id,
        resumed_run_id: newRun.id,
        resumed_from_run_id: task.activeRunId,
        resumed_from_checkpoint_id: latestCheckpoint?.id ?? null,
      },
    },
    {
      task_id: task.id,
      project_id: task.project_id,
      author_agent_id: params.acceptedByAgentId,
      author_name: actorLabel,
      content: `Assigned to ${actorLabel} via handoff claim.`,
      comment_type: 'assignment',
      metadata: {
        handoff_contract_id: params.contract.id,
        old_assignee: task.assignee_agent_id,
        new_assignee: params.acceptedByAgentId,
      },
    },
  ]);

  return {
    taskId: task.id,
    projectId: task.project_id,
    claimedByAgentId: params.acceptedByAgentId,
    priorAssigneeAgentId: task.assignee_agent_id,
    previousRunId: task.activeRunId,
    resumedFromCheckpoint: latestCheckpoint,
    newRun,
  };
}
