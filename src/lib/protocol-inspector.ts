import { createServerClient } from '@/lib/supabase/server';
import type {
  Contract,
  Task,
  TaskExecutionCheckpoint,
  TaskExecutionRun,
  TaskExecutionStatus,
} from '@/lib/types';

export interface InspectorParticipant {
  id: string;
  role: string;
  status: string;
  responded_at: string | null;
  agent: { id: string; name: string; display_name: string | null } | null;
}

export interface InspectorMessage {
  id: string;
  contract_id: string;
  sender_id: string;
  message_type: string;
  content: Record<string, unknown> | null;
  created_at: string;
  sender: { id: string; name: string; display_name: string | null } | null;
}

export interface InspectorTaskLink {
  id: string;
  title: string;
  status: string;
  priority: string;
  project_id: string;
  project_title: string | null;
  sprint_id: string | null;
  sprint_title: string | null;
  assignee: { id: string; name: string; display_name: string | null } | null;
  reporter: { id: string; name: string; display_name: string | null } | null;
  execution_status: TaskExecutionStatus | null;
  active_run_id: string | null;
  execution_started_at: string | null;
  execution_heartbeat_at: string | null;
  execution_completed_at: string | null;
  last_checkpoint_at: string | null;
  last_checkpoint_summary: string | null;
  last_checkpoint_payload: Record<string, unknown> | null;
  linked_via_contract_id: string | null;
}

export interface InspectorWebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status: string;
  attempts: number;
  max_retries: number | null;
  response_status: number | null;
  delivered_at: string | null;
  last_retry_at: string | null;
  created_at: string;
  related_contract_id: string | null;
  related_task_id: string | null;
  webhook: {
    id: string;
    url: string;
    agent_id: string;
    is_active: boolean;
    failure_count: number;
    last_delivery_at: string | null;
  } | null;
}

export interface ProtocolInspectorData {
  contract: (Contract & {
    proposer: { id: string; name: string; display_name: string | null } | null;
    participants: InspectorParticipant[];
  }) | null;
  messages: InspectorMessage[];
  linkedTasks: InspectorTaskLink[];
  task: InspectorTaskLink | null;
  executionRuns: TaskExecutionRun[];
  executionCheckpoints: TaskExecutionCheckpoint[];
  webhookDeliveries: InspectorWebhookDelivery[];
  conformance: {
    contractFound: boolean;
    taskFound: boolean;
    allParticipantsAccepted: boolean | null;
    visibleParticipants: number;
    messageCount: number;
    linkedTaskCount: number;
    runCount: number;
    checkpointCount: number;
    webhookEventCount: number;
    hasTaskLink: boolean;
    hasActiveOrCompletedRun: boolean;
    hasCheckpointEvidence: boolean;
    driftFlags: string[];
  };
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function sortTasks(tasks: InspectorTaskLink[]) {
  return tasks.sort((a, b) => {
    const aTime = a.last_checkpoint_at || a.execution_heartbeat_at || a.execution_started_at || '';
    const bTime = b.last_checkpoint_at || b.execution_heartbeat_at || b.execution_started_at || '';
    return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
  });
}

export async function loadProtocolInspector(args: {
  contractId?: string | null;
  taskId?: string | null;
  agentIds?: string[];
  isSuperAdmin?: boolean;
}): Promise<ProtocolInspectorData> {
  const supabase = createServerClient();
  const contractId = args.contractId?.trim() || null;
  const taskId = args.taskId?.trim() || null;
  const isSuperAdmin = !!args.isSuperAdmin;
  const agentIds = args.agentIds || [];

  interface InspectorTaskRow extends Task {
    project?: { id: string; title: string | null } | null;
    sprint?: { id: string; title: string | null } | null;
    assignee?: { id: string; name: string; display_name: string | null } | null;
    reporter?: { id: string; name: string; display_name: string | null } | null;
  }

  let taskRow: InspectorTaskRow | null = null;

  if (taskId) {
    const { data } = await supabase
      .from('tasks')
      .select(`
        *,
        project:projects(id, title),
        sprint:sprints(id, title),
        assignee:agents!tasks_assignee_agent_id_fkey(id, name, display_name),
        reporter:agents!tasks_reporter_agent_id_fkey(id, name, display_name)
      `)
      .eq('id', taskId)
      .maybeSingle();
    taskRow = (data as InspectorTaskRow | null) || null;
  }

  interface InspectorContractRow extends Contract {
    proposer: { id: string; name: string; display_name: string | null } | null;
    contract_participants: InspectorParticipant[];
  }

  let contractRow: InspectorContractRow | null = null;

  if (contractId) {
    const { data } = await supabase
      .from('contracts')
      .select(`
        *,
        proposer:agents!contracts_proposer_id_fkey(id, name, display_name),
        contract_participants(
          id,
          role,
          status,
          responded_at,
          agent:agents(id, name, display_name)
        )
      `)
      .eq('id', contractId)
      .maybeSingle();
    contractRow = (data as InspectorContractRow | null) || null;
  }

  let visibleContract: InspectorContractRow | null = contractRow;
  const visibleContractParticipants = visibleContract?.contract_participants || [];
  if (visibleContract && !isSuperAdmin) {
    const participantIds = visibleContractParticipants.map((row) => row.agent?.id).filter(Boolean) as string[];
    const canSee = participantIds.some((id) => agentIds.includes(id));
    if (!canSee) visibleContract = null;
  }

  let taskContracts: Array<{ contract_id: string; task_id: string }> = [];
  if (taskId) {
    const { data } = await supabase.from('task_contracts').select('contract_id, task_id').eq('task_id', taskId);
    taskContracts = data || [];
  }
  if (contractId) {
    const { data } = await supabase.from('task_contracts').select('contract_id, task_id').eq('contract_id', contractId);
    taskContracts = dedupeById([
      ...taskContracts.map((row, index) => ({ id: `${row.contract_id}:${row.task_id}:${index}`, ...row })),
      ...(data || []).map((row, index) => ({ id: `${row.contract_id}:${row.task_id}:c${index}`, ...row })),
    ]).map(({ contract_id, task_id }) => ({ contract_id, task_id }));
  }

  const linkedTaskIds = dedupeById(
    [
      ...taskContracts.map((row, index) => ({ id: `${row.task_id}:${index}`, task_id: row.task_id })),
      ...(taskRow ? [{ id: taskRow.id, task_id: taskRow.id }] : []),
    ],
  ).map((row) => row.task_id);

  let linkedTasks: InspectorTaskLink[] = [];
  if (linkedTaskIds.length > 0) {
    const { data } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        priority,
        project_id,
        sprint_id,
        assignee_agent_id,
        reporter_agent_id,
        active_run_id,
        execution_status,
        execution_started_at,
        execution_heartbeat_at,
        execution_completed_at,
        last_checkpoint_at,
        last_checkpoint_summary,
        last_checkpoint_payload,
        project:projects(id, title),
        sprint:sprints(id, title),
        assignee:agents!tasks_assignee_agent_id_fkey(id, name, display_name),
        reporter:agents!tasks_reporter_agent_id_fkey(id, name, display_name)
      `)
      .in('id', linkedTaskIds);

    const linkMap = new Map(taskContracts.map((link) => [link.task_id, link.contract_id]));
    linkedTasks = sortTasks(((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      status: row.status as string,
      priority: row.priority as string,
      project_id: row.project_id as string,
      project_title: ((row.project as { title?: string } | null)?.title) || null,
      sprint_id: (row.sprint_id as string | null) || null,
      sprint_title: ((row.sprint as { title?: string } | null)?.title) || null,
      assignee: (row.assignee as InspectorTaskLink['assignee']) || null,
      reporter: (row.reporter as InspectorTaskLink['reporter']) || null,
      execution_status: (row.execution_status as TaskExecutionStatus | null) || null,
      active_run_id: (row.active_run_id as string | null) || null,
      execution_started_at: (row.execution_started_at as string | null) || null,
      execution_heartbeat_at: (row.execution_heartbeat_at as string | null) || null,
      execution_completed_at: (row.execution_completed_at as string | null) || null,
      last_checkpoint_at: (row.last_checkpoint_at as string | null) || null,
      last_checkpoint_summary: (row.last_checkpoint_summary as string | null) || null,
      last_checkpoint_payload: (row.last_checkpoint_payload as Record<string, unknown> | null) || null,
      linked_via_contract_id: linkMap.get(row.id as string) || null,
    })));
  }

  const effectiveTask = taskId ? linkedTasks.find((row) => row.id === taskId) || null : linkedTasks[0] || null;

  const taskIdsForRuns = dedupeById(
    [
      ...linkedTasks.map((row) => ({ id: row.id })),
      ...(effectiveTask ? [{ id: effectiveTask.id }] : []),
    ],
  ).map((row) => row.id);

  let executionRuns: TaskExecutionRun[] = [];
  if (taskIdsForRuns.length > 0) {
    const { data } = await supabase
      .from('task_execution_runs')
      .select('*')
      .in('task_id', taskIdsForRuns)
      .order('created_at', { ascending: false })
      .limit(50);
    executionRuns = (data || []) as TaskExecutionRun[];
  }

  const runIds = executionRuns.map((row) => row.id);
  let executionCheckpoints: TaskExecutionCheckpoint[] = [];
  if (runIds.length > 0) {
    const { data } = await supabase
      .from('task_execution_checkpoints')
      .select('*')
      .in('run_id', runIds)
      .order('created_at', { ascending: false })
      .limit(100);
    executionCheckpoints = (data || []) as TaskExecutionCheckpoint[];
  }

  let messages: InspectorMessage[] = [];
  if (visibleContract) {
    const { data } = await supabase
      .from('messages')
      .select(`
        id,
        contract_id,
        sender_id,
        message_type,
        content,
        created_at,
        sender:agents!messages_sender_id_fkey(id, name, display_name)
      `)
      .eq('contract_id', visibleContract.id)
      .order('created_at', { ascending: true });
    messages = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      contract_id: row.contract_id as string,
      sender_id: row.sender_id as string,
      message_type: row.message_type as string,
      content: (row.content as Record<string, unknown> | null) || null,
      created_at: row.created_at as string,
      sender: ((Array.isArray(row.sender) ? row.sender[0] : row.sender) as InspectorMessage['sender']) || null,
    }));
  }

  let webhookDeliveries: InspectorWebhookDelivery[] = [];
  const deliveryQuery = supabase
    .from('webhook_deliveries')
    .select(`
      id,
      webhook_id,
      event,
      status,
      attempts,
      max_retries,
      response_status,
      delivered_at,
      last_retry_at,
      created_at,
      payload,
      webhooks(id, url, agent_id, is_active, failure_count, last_delivery_at)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: deliveryRows } = await deliveryQuery;
  webhookDeliveries = ((deliveryRows || []) as Array<Record<string, unknown>>)
    .map((row) => {
      const payload = row.payload as { event?: { contract_id?: string; task_id?: string } } | null;
      const relatedContractId = payload?.event?.contract_id || null;
      const relatedTaskId = payload?.event?.task_id || null;
      return {
        id: row.id as string,
        webhook_id: row.webhook_id as string,
        event: row.event as string,
        status: row.status as string,
        attempts: row.attempts as number,
        max_retries: (row.max_retries as number | null) || null,
        response_status: (row.response_status as number | null) || null,
        delivered_at: (row.delivered_at as string | null) || null,
        last_retry_at: (row.last_retry_at as string | null) || null,
        created_at: row.created_at as string,
        related_contract_id: relatedContractId,
        related_task_id: relatedTaskId,
        webhook: (Array.isArray(row.webhooks) ? row.webhooks[0] : row.webhooks) as InspectorWebhookDelivery['webhook'],
      } satisfies InspectorWebhookDelivery;
    })
    .filter((row) => {
      const contractMatch = visibleContract ? row.related_contract_id === visibleContract.id : false;
      const taskMatch = effectiveTask ? row.related_task_id === effectiveTask.id : false;
      return contractMatch || taskMatch;
    });

  const participantStatuses = visibleContract?.contract_participants || [];
  const allParticipantsAccepted = visibleContract
    ? participantStatuses.length > 0 && participantStatuses.every((participant) => participant.status === 'accepted')
    : null;

  const hasTaskLink = linkedTasks.length > 0;
  const hasActiveOrCompletedRun = executionRuns.some((run) => ['running', 'starting', 'succeeded', 'failed', 'cancelled', 'blocked', 'waiting', 'pending-approval', 'paused', 'handoff-needed'].includes(run.status));
  const hasCheckpointEvidence = executionCheckpoints.length > 0 || linkedTasks.some((task) => !!task.last_checkpoint_at);
  const driftFlags: string[] = [];

  if (visibleContract && !hasTaskLink) driftFlags.push('Contract has no linked task.');
  if (visibleContract && hasTaskLink && messages.length === 0) driftFlags.push('Contract has linked task(s) but no visible messages.');
  if (effectiveTask && !executionRuns.length && effectiveTask.execution_status && effectiveTask.execution_status !== 'idle') driftFlags.push('Task snapshot shows execution state but no execution runs were found.');
  if (effectiveTask && executionRuns.length > 0 && !hasCheckpointEvidence) driftFlags.push('Execution runs exist but no checkpoints were recorded.');
  if ((visibleContract || effectiveTask) && webhookDeliveries.length === 0) driftFlags.push('No webhook delivery evidence found for this flow.');
  if (visibleContract && allParticipantsAccepted === false && visibleContract.status === 'active') driftFlags.push('Contract is active but not all participants show accepted.');

  return {
    contract: visibleContract
      ? {
          ...visibleContract,
          participants: visibleContract.contract_participants || [],
        }
      : null,
    messages,
    linkedTasks,
    task: effectiveTask,
    executionRuns,
    executionCheckpoints,
    webhookDeliveries,
    conformance: {
      contractFound: !!visibleContract,
      taskFound: !!effectiveTask,
      allParticipantsAccepted,
      visibleParticipants: participantStatuses.length,
      messageCount: messages.length,
      linkedTaskCount: linkedTasks.length,
      runCount: executionRuns.length,
      checkpointCount: executionCheckpoints.length,
      webhookEventCount: webhookDeliveries.length,
      hasTaskLink,
      hasActiveOrCompletedRun,
      hasCheckpointEvidence,
      driftFlags,
    },
  };
}
