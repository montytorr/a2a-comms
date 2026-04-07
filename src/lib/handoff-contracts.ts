import type { ContractResponse, Task, TaskAttachment, TaskExecutionCheckpoint, TaskExecutionRun } from '@/lib/types';

export interface HandoffContractSummary {
  contractId: string;
  title: string;
  status: string;
  linkedTaskId: string | null;
  linkedTaskTitle: string | null;
}

export interface BuildHandoffContractInput {
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
  priorHandoffs?: HandoffContractSummary[];
}

function jsonFence(value: unknown) {
  return `\n\n\`\`\`json\n${JSON.stringify(value ?? {}, null, 2)}\n\`\`\``;
}

export function buildHandoffContractTitle(taskTitle: string) {
  return `Handoff · ${taskTitle}`;
}

export function buildHandoffContractDescription(input: BuildHandoffContractInput) {
  const checkpoints = (input.checkpoints || []).slice(0, 5);
  const attachments = input.attachments || [];
  const priorHandoffs = input.priorHandoffs || [];
  const lines: string[] = [];

  lines.push(`## Task handoff`);
  lines.push('');
  lines.push(`This contract is the formal handoff surface for task **${input.task.title}**.`);
  lines.push('The task remains the execution source of truth; this contract carries the transfer brief, latest checkpoint context, and artifact pointers needed for the next agent/operator to take over cleanly.');
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

  if (input.task.description) {
    lines.push('');
    lines.push('## Task description');
    lines.push('');
    lines.push(input.task.description);
  }

  lines.push('');
  lines.push('## Handoff brief');
  lines.push('');
  if (input.task.last_checkpoint_summary) {
    lines.push(`Latest checkpoint summary: **${input.task.last_checkpoint_summary}**`);
  } else if (input.run?.summary) {
    lines.push(`Latest run summary: **${input.run.summary}**`);
  } else {
    lines.push('No checkpoint summary was recorded yet. Inspect the linked task and active run before resuming.');
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
    lines.push('');
    lines.push('Use the linked task/contract attachment endpoints to inspect or extend artifacts during the handoff.');
  }

  if (priorHandoffs.length > 0) {
    lines.push('');
    lines.push('## Prior handoff contracts');
    lines.push('');
    for (const handoff of priorHandoffs.slice(0, 5)) {
      lines.push(`- \`${handoff.contractId}\` — **${handoff.title}** [${handoff.status}]${handoff.linkedTaskId ? ` linked task \`${handoff.linkedTaskId}\`` : ''}`);
    }
  }

  lines.push('');
  lines.push('## Acceptance expectations');
  lines.push('');
  lines.push('- Accept this contract only if you are taking ownership of the next execution step.');
  lines.push('- Once accepted, continue the task through the linked project task execution run/checkpoint surfaces.');
  lines.push('- If new artifacts are needed, upload them against the linked task or this contract after the handoff is active.');

  return lines.join('\n');
}

export function isLikelyHandoffContract(contract: Pick<ContractResponse, 'title' | 'description'>) {
  const title = (contract.title || '').toLowerCase();
  const description = (contract.description || '').toLowerCase();
  return title.startsWith('handoff ·') || description.includes('## task handoff');
}
