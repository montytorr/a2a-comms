import type { TaskExecutionCheckpointRow, TaskExecutionRunRow } from '@/lib/task-execution';

export interface DelegationProvenance {
  delegatedByAgentId: string | null;
  delegatedByRunId: string | null;
  delegatedByCheckpointId: string | null;
  delegatedByCheckpointKey: string | null;
  delegatedBySummary: string | null;
  delegatedAt: string | null;
  delegatedFromAssigneeAgentId: string | null;
  delegatedFromTaskStatus: string | null;
  delegatedFromExecutionStatus: string | null;
  delegationReason: string | null;
  delegationContractId: string | null;
  claimType: string | null;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function getDelegationProvenance(metadata: Record<string, unknown> | null | undefined): DelegationProvenance | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const delegatedByAgentId = pickString(metadata.delegated_by_agent_id) ?? pickString(metadata.claimed_from_agent_id);
  const delegatedByRunId = pickString(metadata.delegated_by_run_id) ?? pickString(metadata.resumed_from_run_id);
  const delegatedByCheckpointId = pickString(metadata.delegated_by_checkpoint_id) ?? pickString(metadata.resumed_from_checkpoint_id);
  const delegatedByCheckpointKey = pickString(metadata.delegated_by_checkpoint_key) ?? pickString(metadata.resumed_from_checkpoint_key);
  const delegatedBySummary = pickString(metadata.delegated_by_summary);
  const delegatedAt = pickString(metadata.delegated_at);
  const delegatedFromAssigneeAgentId = pickString(metadata.delegated_from_assignee_agent_id) ?? pickString(metadata.claimed_from_agent_id);
  const delegatedFromTaskStatus = pickString(metadata.delegated_from_task_status);
  const delegatedFromExecutionStatus = pickString(metadata.delegated_from_execution_status);
  const delegationReason = pickString(metadata.delegation_reason);
  const delegationContractId = pickString(metadata.delegation_contract_id) ?? pickString(metadata.handoff_contract_id);
  const claimType = pickString(metadata.claim_type);

  if (!delegatedByAgentId && !delegatedByRunId && !delegatedByCheckpointId && !delegationContractId && claimType !== 'delegated-execution') {
    return null;
  }

  return {
    delegatedByAgentId,
    delegatedByRunId,
    delegatedByCheckpointId,
    delegatedByCheckpointKey,
    delegatedBySummary,
    delegatedAt,
    delegatedFromAssigneeAgentId,
    delegatedFromTaskStatus,
    delegatedFromExecutionStatus,
    delegationReason,
    delegationContractId,
    claimType,
  };
}

export function isDelegatedExecutionRun(run: Pick<TaskExecutionRunRow, 'metadata'> | null | undefined) {
  return !!getDelegationProvenance(run?.metadata);
}

export function getDelegatedExecutionPayload(checkpoint: Pick<TaskExecutionCheckpointRow, 'payload'> | null | undefined) {
  const payload = checkpoint?.payload;
  if (!payload || typeof payload !== 'object') return null;
  if (pickString(payload.delegated_by_agent_id) || pickString(payload.resumed_from_run_id) || pickString(payload.delegation_contract_id)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

export function buildDelegationSummary(input: {
  taskTitle: string;
  contractId: string;
  fromAgentId: string | null;
  toAgentId: string;
  checkpointSummary: string | null;
}) {
  const from = input.fromAgentId || 'previous owner';
  const summary = input.checkpointSummary || 'resume from the latest checkpoint';
  return `Delegated execution for ${input.taskTitle} from ${from} to ${input.toAgentId} via contract ${input.contractId}. ${summary}`;
}
