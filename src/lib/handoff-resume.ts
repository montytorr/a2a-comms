import { createServerClient } from '@/lib/supabase/server';
import {
  appendTaskCheckpoint,
  createTaskExecutionRun,
  getLatestTaskCheckpoint,
  updateTaskExecutionRun,
  type TaskExecutionCheckpointRow,
  type TaskExecutionRunRow,
} from '@/lib/task-execution';
import type { Contract } from '@/lib/types';

export interface HandoffTaskContext {
  taskId: string;
  projectId: string;
  title: string;
  status: string | null;
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
    .select(
      'task:tasks!task_contracts_task_id_fkey(id, project_id, title, status, assignee_agent_id, active_run_id, execution_status, last_checkpoint_summary, last_checkpoint_payload)',
    )
    .eq('contract_id', contractId)
    .limit(1)
    .maybeSingle();

  const task = Array.isArray(data?.task) ? data.task[0] : data?.task;
  if (!task) return null;

  return {
    taskId: task.id,
    projectId: task.project_id,
    title: task.title,
    status: task.status ?? null,
    assigneeAgentId: task.assignee_agent_id ?? null,
    activeRunId: task.active_run_id ?? null,
    executionStatus: task.execution_status ?? null,
    lastCheckpointSummary: task.last_checkpoint_summary ?? null,
    lastCheckpointPayload: (task.last_checkpoint_payload as Record<string, unknown> | null) ?? null,
  };
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
  const latestCheckpoint = task.activeRunId
    ? await getLatestTaskCheckpoint(task.taskId, task.activeRunId).catch(() => null)
    : null;

  if (task.activeRunId && task.assigneeAgentId && task.assigneeAgentId !== params.acceptedByAgentId) {
    await updateTaskExecutionRun({
      runId: task.activeRunId,
      taskId: task.taskId,
      status: 'handoff-needed',
      summary: latestCheckpoint?.summary || task.lastCheckpointSummary || `Execution delegated to ${actorLabel}`,
      metadata: {
        handoff_contract_id: params.contract.id,
        delegated_to_agent_id: params.acceptedByAgentId,
        delegated_to_agent_name: params.acceptedByAgentName,
        delegated_to_agent_display_name: params.acceptedByAgentDisplayName || null,
        delegation_reason: 'contract accepted',
        delegation_claim_type: 'delegated-execution',
      },
    }).catch(() => null);
  }

  const newRun = await createTaskExecutionRun({
    taskId: task.taskId,
    projectId: task.projectId,
    agentId: params.acceptedByAgentId,
    status: 'starting',
    summary: latestCheckpoint?.summary || task.lastCheckpointSummary || `Claimed handoff contract ${params.contract.id}`,
    metadata: {
      handoff_contract_id: params.contract.id,
      delegation_contract_id: params.contract.id,
      delegated_by_agent_id: task.assigneeAgentId,
      delegated_by_run_id: task.activeRunId,
      delegated_by_checkpoint_id: latestCheckpoint?.id ?? null,
      delegated_by_checkpoint_key: latestCheckpoint?.checkpoint_key ?? null,
      delegated_by_summary: latestCheckpoint?.summary || task.lastCheckpointSummary || null,
      delegated_at: new Date().toISOString(),
      delegated_from_assignee_agent_id: task.assigneeAgentId,
      delegated_from_execution_status: task.executionStatus,
      delegated_from_task_status: task.status,
      resumed_from_run_id: task.activeRunId,
      resumed_from_checkpoint_id: latestCheckpoint?.id ?? null,
      resumed_from_checkpoint_key: latestCheckpoint?.checkpoint_key ?? null,
      claimed_from_agent_id: task.assigneeAgentId,
      claim_type: 'delegated-execution',
    },
  });

  const checkpointPayload = {
    contract_id: params.contract.id,
    delegation_contract_id: params.contract.id,
    resumed_from_run_id: task.activeRunId,
    resumed_from_checkpoint_id: latestCheckpoint?.id ?? null,
    resumed_from_checkpoint_key: latestCheckpoint?.checkpoint_key ?? null,
    resumed_from_summary: latestCheckpoint?.summary ?? task.lastCheckpointSummary ?? null,
    resumed_from_payload: latestCheckpoint?.payload ?? task.lastCheckpointPayload ?? {},
    prior_assignee_agent_id: task.assigneeAgentId,
    delegated_by_agent_id: task.assigneeAgentId,
    delegated_by_run_id: task.activeRunId,
    delegated_by_checkpoint_id: latestCheckpoint?.id ?? null,
    delegated_by_checkpoint_key: latestCheckpoint?.checkpoint_key ?? null,
    delegated_by_summary: latestCheckpoint?.summary ?? task.lastCheckpointSummary ?? null,
    delegated_at: new Date().toISOString(),
    claimed_by_agent_id: params.acceptedByAgentId,
    claim_type: 'delegated-execution',
  };

  await appendTaskCheckpoint({
    runId: newRun.id,
    taskId: task.taskId,
    projectId: task.projectId,
    agentId: params.acceptedByAgentId,
    checkpointKey: 'delegated-execution-claimed',
    summary: `Claimed delegated execution from contract ${params.contract.id}`,
    payload: checkpointPayload,
    attachmentIds: latestCheckpoint?.attachment_ids ?? [],
  });

  await supabase
    .from('tasks')
    .update({
      assignee_agent_id: params.acceptedByAgentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.taskId)
    .eq('project_id', task.projectId);

  await supabase.from('task_comments').insert([
    {
      task_id: task.taskId,
      project_id: task.projectId,
      author_agent_id: params.acceptedByAgentId,
      author_name: actorLabel,
      content: `Claimed delegated execution contract \`${params.contract.id}\` and became the active executor for this task.`,
      comment_type: 'system',
      metadata: {
        handoff_contract_id: params.contract.id,
        resumed_run_id: newRun.id,
        resumed_from_run_id: task.activeRunId,
        resumed_from_checkpoint_id: latestCheckpoint?.id ?? null,
      },
    },
    {
      task_id: task.taskId,
      project_id: task.projectId,
      author_agent_id: params.acceptedByAgentId,
      author_name: actorLabel,
      content: `Assigned to ${actorLabel} as executor via delegated execution.`,
      comment_type: 'assignment',
      metadata: {
        handoff_contract_id: params.contract.id,
        delegation_contract_id: params.contract.id,
        old_assignee: task.assigneeAgentId,
        new_assignee: params.acceptedByAgentId,
        delegated_by_agent_id: task.assigneeAgentId,
        executor_agent_id: params.acceptedByAgentId,
      },
    },
  ]);

  return {
    taskId: task.taskId,
    projectId: task.projectId,
    claimedByAgentId: params.acceptedByAgentId,
    priorAssigneeAgentId: task.assigneeAgentId,
    previousRunId: task.activeRunId,
    resumedFromCheckpoint: latestCheckpoint,
    newRun,
  };
}
