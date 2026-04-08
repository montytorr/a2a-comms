import type { ContractResponse, Task, TaskAttachment, TaskExecutionCheckpoint, TaskExecutionRun } from '@/lib/types';

export interface EscalationBrokerageProvenance {
  escalationRequestedByAgentId: string | null;
  escalationRequestedAt: string | null;
  escalationReason: string | null;
  requestedIntervention: string | null;
  brokerAgentId: string | null;
  brokerAssignedAt: string | null;
  brokeredFromRunId: string | null;
  brokeredFromCheckpointId: string | null;
  brokeredFromCheckpointKey: string | null;
  brokeredFromSummary: string | null;
  brokerContractId: string | null;
  collaborationMode: string | null;
  escalationStatus: string | null;
}

export interface BrokerContractSummary {
  contractId: string;
  title: string;
  status: string;
  linkedTaskId: string | null;
  linkedTaskTitle: string | null;
}

export interface BuildBrokeredCollaborationInput {
  task: Pick<Task,
    | 'id'
    | 'title'
    | 'description'
    | 'status'
    | 'priority'
    | 'labels'
    | 'due_date'
    | 'execution_status'
    | 'execution_started_at'
    | 'execution_heartbeat_at'
    | 'execution_completed_at'
    | 'last_checkpoint_at'
    | 'last_checkpoint_summary'
    | 'last_checkpoint_payload'
    | 'active_run_id'>;
  run?: Pick<TaskExecutionRun,
    | 'id'
    | 'status'
    | 'attempt'
    | 'summary'
    | 'error_message'
    | 'heartbeat_at'
    | 'started_at'
    | 'completed_at'
    | 'metadata'> | null;
  checkpoints?: Array<Pick<TaskExecutionCheckpoint,
    | 'id'
    | 'sequence'
    | 'checkpoint_key'
    | 'summary'
    | 'payload'
    | 'created_at'
    | 'attachment_ids'>>;
  attachments?: Array<Pick<TaskAttachment,
    | 'id'
    | 'original_name'
    | 'filename'
    | 'mime_type'
    | 'size_bytes'
    | 'created_at'>>;
  priorBrokerContracts?: BrokerContractSummary[];
  escalationReason?: string | null;
  requestedIntervention?: string | null;
  brokerAgentNames?: string[];
}

function jsonFence(value: unknown) {
  return `\n\n\`\`\`json\n${JSON.stringify(value ?? {}, null, 2)}\n\`\`\``;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function buildBrokeredCollaborationTitle(taskTitle: string) {
  return `Escalation · ${taskTitle}`;
}

export function buildBrokeredCollaborationDescription(input: BuildBrokeredCollaborationInput) {
  const checkpoints = (input.checkpoints || []).slice(0, 5);
  const attachments = input.attachments || [];
  const priorBrokerContracts = input.priorBrokerContracts || [];
  const lines: string[] = [];

  lines.push('## Task escalation');
  lines.push('');
  lines.push(`This contract is the formal escalation / brokered collaboration surface for task **${input.task.title}**.`);
  lines.push('The task remains the execution source of truth. This contract exists so a broker/mediator can intervene intentionally without muddling executor ownership, observer analysis, or task provenance.');
  lines.push('');
  lines.push('## Delivery context');
  lines.push('');
  lines.push(`- Task ID: \`${input.task.id}\``);
  lines.push(`- Task status: \`${input.task.status}\``);
  lines.push(`- Task priority: \`${input.task.priority}\``);
  lines.push(`- Execution status: \`${input.task.execution_status || 'idle'}\``);
  if (input.task.active_run_id) lines.push(`- Active run ID: \`${input.task.active_run_id}\``);
  if (input.run) {
    lines.push(`- Current run attempt: \`${input.run.attempt}\``);
    lines.push(`- Current run status: \`${input.run.status}\``);
  }
  if (input.task.due_date) lines.push(`- Due date: ${input.task.due_date}`);
  if (input.task.labels?.length) lines.push(`- Labels: ${input.task.labels.map((label) => `\`${label}\``).join(', ')}`);

  lines.push('');
  lines.push('## Escalation request');
  lines.push('');
  lines.push(`- Escalation reason: ${input.escalationReason || 'No explicit reason captured; inspect the linked task/checkpoints.'}`);
  lines.push(`- Requested intervention: ${input.requestedIntervention || 'Broker to inspect blockers/risks and coordinate the next safe step.'}`);
  lines.push(`- Desired collaboration mode: \`brokered-collaboration\``);
  if (input.brokerAgentNames?.length) {
    lines.push(`- Requested broker(s): ${input.brokerAgentNames.map((name) => `\`${name}\``).join(', ')}`);
  }

  if (input.task.description) {
    lines.push('');
    lines.push('## Task description');
    lines.push('');
    lines.push(input.task.description);
  }

  lines.push('');
  lines.push('## Latest execution context');
  lines.push('');
  if (input.task.last_checkpoint_summary) {
    lines.push(`Latest checkpoint summary: **${input.task.last_checkpoint_summary}**`);
  } else if (input.run?.summary) {
    lines.push(`Latest run summary: **${input.run.summary}**`);
  } else {
    lines.push('No checkpoint summary was recorded yet. Inspect the linked task and active run before brokering a resolution.');
  }

  if (input.run?.error_message) {
    lines.push('');
    lines.push(`Current run note/error: ${input.run.error_message}`);
  }

  if (input.task.last_checkpoint_payload && Object.keys(input.task.last_checkpoint_payload).length > 0) {
    lines.push('');
    lines.push('### Latest checkpoint payload');
    lines.push(jsonFence(input.task.last_checkpoint_payload));
  }

  if (checkpoints.length > 0) {
    lines.push('');
    lines.push('## Recent checkpoints');
    lines.push('');
    for (const checkpoint of checkpoints) {
      const attachmentCount = checkpoint.attachment_ids?.length || 0;
      lines.push(`- #${checkpoint.sequence} \`${checkpoint.checkpoint_key}\` — ${checkpoint.summary || 'No summary'} (${checkpoint.created_at})${attachmentCount ? ` · ${attachmentCount} attachment(s)` : ''}`);
    }
  }

  if (attachments.length > 0) {
    lines.push('');
    lines.push('## Available task artifacts');
    lines.push('');
    for (const attachment of attachments.slice(0, 10)) {
      lines.push(`- \`${attachment.id}\` — **${attachment.original_name || attachment.filename}** (${attachment.mime_type}, ${attachment.size_bytes} bytes, uploaded ${attachment.created_at})`);
    }
  }

  if (priorBrokerContracts.length > 0) {
    lines.push('');
    lines.push('## Prior escalation / broker contracts');
    lines.push('');
    for (const brokered of priorBrokerContracts.slice(0, 5)) {
      lines.push(`- \`${brokered.contractId}\` — **${brokered.title}** [${brokered.status}]${brokered.linkedTaskId ? ` linked task \`${brokered.linkedTaskId}\`` : ''}`);
    }
  }

  lines.push('');
  lines.push('## Collaboration expectations');
  lines.push('');
  lines.push('- Accept this contract only if you are intentionally entering as a broker / mediator for this escalation.');
  lines.push('- The current executor/owner provenance must remain visible; brokering should coordinate or de-risk, not silently seize authorship.');
  lines.push('- Use task comments, execution run metadata, checkpoints, and contract messages to record blockers, intervention, and next-step decisions explicitly.');
  lines.push('- If execution ownership later transfers, that should still happen through the task execution surfaces with durable provenance.');

  return lines.join('\n');
}

export function isLikelyBrokerContract(contract: Pick<ContractResponse, 'title' | 'description'>) {
  const title = (contract.title || '').toLowerCase();
  const description = (contract.description || '').toLowerCase();
  return title.startsWith('escalation ·') || description.includes('## task escalation') || description.includes('brokered collaboration');
}

export function getEscalationBrokerageProvenance(metadata: Record<string, unknown> | null | undefined): EscalationBrokerageProvenance | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const escalationRequestedByAgentId = pickString(metadata.escalation_requested_by_agent_id);
  const escalationRequestedAt = pickString(metadata.escalation_requested_at);
  const escalationReason = pickString(metadata.escalation_reason);
  const requestedIntervention = pickString(metadata.requested_intervention);
  const brokerAgentId = pickString(metadata.broker_agent_id);
  const brokerAssignedAt = pickString(metadata.broker_assigned_at);
  const brokeredFromRunId = pickString(metadata.brokered_from_run_id);
  const brokeredFromCheckpointId = pickString(metadata.brokered_from_checkpoint_id);
  const brokeredFromCheckpointKey = pickString(metadata.brokered_from_checkpoint_key);
  const brokeredFromSummary = pickString(metadata.brokered_from_summary);
  const brokerContractId = pickString(metadata.broker_contract_id) ?? pickString(metadata.escalation_contract_id);
  const collaborationMode = pickString(metadata.collaboration_mode);
  const escalationStatus = pickString(metadata.escalation_status);

  if (
    !escalationRequestedByAgentId &&
    !escalationReason &&
    !requestedIntervention &&
    !brokerAgentId &&
    !brokerContractId &&
    collaborationMode !== 'brokered-collaboration'
  ) {
    return null;
  }

  return {
    escalationRequestedByAgentId,
    escalationRequestedAt,
    escalationReason,
    requestedIntervention,
    brokerAgentId,
    brokerAssignedAt,
    brokeredFromRunId,
    brokeredFromCheckpointId,
    brokeredFromCheckpointKey,
    brokeredFromSummary,
    brokerContractId,
    collaborationMode,
    escalationStatus,
  };
}

export function isBrokeredExecutionRun(run: Pick<TaskExecutionRun, 'metadata'> | null | undefined) {
  return !!getEscalationBrokerageProvenance(run?.metadata as Record<string, unknown> | null | undefined);
}
