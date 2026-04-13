import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectVisibleAgentIds } from '../../../_helpers';
import { sendTaskAssignedEmail } from '@/lib/email';
import { getUserEmail } from '@/lib/email/helpers';
import { refreshTaskBlockedState } from '@/lib/task-blocker-actions';
import { appendTaskCheckpoint, createTaskExecutionRun, listTaskExecutionCheckpoints, listTaskExecutionRuns, updateTaskExecutionRun, type TaskExecutionRunRow } from '@/lib/task-execution';
import type { TaskExecutionCheckpointRow } from '@/lib/task-execution';
import { listAttachmentsForScope } from '@/lib/attachment-access';
import { buildHandoffContractDescription, buildHandoffContractTitle, isLikelyHandoffContract, type HandoffContractSummary } from '@/lib/handoff-contracts';
import { buildBrokeredCollaborationDescription, buildBrokeredCollaborationTitle, getEscalationBrokerageProvenance, isLikelyBrokerContract, type BrokerContractSummary } from '@/lib/escalation-brokerage';
import { appendTaskActivityEvent, listTaskActivityEvents } from '@/lib/task-activity';
import type { UpdateTaskRequest, ApiError, TaskStatus } from '@/lib/types';
import { getProjectAccess } from '@/lib/project-access';
import { evaluateObserverProjectReadPolicyAccess } from '@/lib/agent-trust-policy';
import { evaluateEscalationBroker, evaluateHandoffInvite } from '@/lib/trust-tiers';

async function notifyAssigneeOwner(
  supabase: ReturnType<typeof createServerClient>,
  options: {
    assigneeAgentId: string;
    projectId: string;
    taskId: string;
    taskTitle: string;
    priority: string;
  }
) {
  const { data: assigneeAgent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', options.assigneeAgentId)
    .single();

  if (!assigneeAgent?.owner_user_id) return;

  const email = await getUserEmail(assigneeAgent.owner_user_id);
  if (!email) return;

  const { data: project } = await supabase
    .from('projects')
    .select('name, title')
    .eq('id', options.projectId)
    .single();

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (() => {
    console.warn('[task-email] NEXT_PUBLIC_APP_URL is not set — falling back to playground domain');
    return 'https://a2a.playground.montytorr.tech';
  })();

  await sendTaskAssignedEmail(
    email,
    {
      taskTitle: options.taskTitle,
      projectName: project?.title || project?.name || 'Unknown Project',
      priority: options.priority || 'medium',
      taskUrl: `${APP_URL}/projects/${options.projectId}/tasks/${options.taskId}`,
    },
    assigneeAgent.owner_user_id
  );
}

async function verifyMembership(projectId: string, agentId: string) {
  return getProjectAccess(projectId, agentId);
}

function isTerminalRunStatus(status: string | null | undefined) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function mapTaskStatusToRunStatus(status: TaskStatus): 'running' | 'waiting' | 'succeeded' | 'cancelled' {
  switch (status) {
    case 'in-progress':
      return 'running';
    case 'in-review':
      return 'waiting';
    case 'done':
      return 'succeeded';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}

function buildStatusCheckpoint(status: TaskStatus) {
  switch (status) {
    case 'in-progress':
      return {
        checkpointKey: 'task-status-in-progress',
        summary: 'Task moved to in-progress',
      };
    case 'in-review':
      return {
        checkpointKey: 'task-status-in-review',
        summary: 'Task moved to in-review',
      };
    case 'done':
      return {
        checkpointKey: 'task-status-done',
        summary: 'Task marked done',
      };
    case 'cancelled':
      return {
        checkpointKey: 'task-status-cancelled',
        summary: 'Task cancelled',
      };
    default:
      return {
        checkpointKey: 'task-status-updated',
        summary: `Task status updated to ${status}`,
      };
  };
}

async function syncTaskExecutionForStatusChange(params: {
  taskId: string;
  projectId: string;
  oldTask: { status: string | null; active_run_id?: string | null } | null;
  task: { id: string; title: string; status: string | null; active_run_id?: string | null };
  actor: { id: string; name: string; display_name?: string | null };
}) {
  const nextStatus = params.task.status;
  const previousStatus = params.oldTask?.status ?? null;
  if (!nextStatus || previousStatus === nextStatus) return;
  if (!['in-progress', 'in-review', 'done', 'cancelled'].includes(nextStatus)) return;

  const runs = await listTaskExecutionRuns(params.taskId).catch(() => []);
  let activeRun: TaskExecutionRunRow | null = null;
  const preferredRunId = params.task.active_run_id || params.oldTask?.active_run_id || null;
  if (preferredRunId) {
    activeRun = runs.find((run) => run.id === preferredRunId) ?? null;
  }
  if (!activeRun) {
    activeRun = runs.find((run) => !isTerminalRunStatus(run.status)) ?? null;
  }

  const checkpoint = buildStatusCheckpoint(nextStatus as TaskStatus);
  const checkpointPayload = {
    old_status: previousStatus,
    new_status: nextStatus,
    source: 'task.patch',
    task_title: params.task.title,
  };

  if (nextStatus === 'in-progress') {
    if (!activeRun || isTerminalRunStatus(activeRun.status)) {
      const attempt = Math.max(0, ...runs.map((run) => run.attempt || 0)) + 1;
      activeRun = await createTaskExecutionRun({
        taskId: params.taskId,
        projectId: params.projectId,
        agentId: params.actor.id,
        status: 'running',
        attempt,
        summary: checkpoint.summary,
        metadata: {
          source: 'task.patch',
          status_transition: { from: previousStatus, to: nextStatus },
        },
      }).catch(() => null);
    } else if (activeRun.status !== 'running') {
      activeRun = await updateTaskExecutionRun({
        runId: activeRun.id,
        taskId: params.taskId,
        status: 'running',
        summary: checkpoint.summary,
        metadata: {
          ...activeRun.metadata,
          source: 'task.patch',
          status_transition: { from: previousStatus, to: nextStatus },
        },
      }).catch(() => activeRun);
    }
  } else if (nextStatus === 'in-review') {
    if (activeRun && !isTerminalRunStatus(activeRun.status)) {
      activeRun = await updateTaskExecutionRun({
        runId: activeRun.id,
        taskId: params.taskId,
        status: mapTaskStatusToRunStatus(nextStatus as TaskStatus),
        summary: checkpoint.summary,
        metadata: {
          ...activeRun.metadata,
          source: 'task.patch',
          status_transition: { from: previousStatus, to: nextStatus },
        },
      }).catch(() => activeRun);
    }
  } else if (nextStatus === 'done' || nextStatus === 'cancelled') {
    if (activeRun && !isTerminalRunStatus(activeRun.status)) {
      activeRun = await updateTaskExecutionRun({
        runId: activeRun.id,
        taskId: params.taskId,
        status: mapTaskStatusToRunStatus(nextStatus as TaskStatus),
        summary: checkpoint.summary,
        metadata: {
          ...activeRun.metadata,
          source: 'task.patch',
          status_transition: { from: previousStatus, to: nextStatus },
        },
      }).catch(() => activeRun);
    }
  }

  if (activeRun) {
    await appendTaskCheckpoint({
      runId: activeRun.id,
      taskId: params.taskId,
      projectId: params.projectId,
      agentId: params.actor.id,
      checkpointKey: checkpoint.checkpointKey,
      summary: checkpoint.summary,
      payload: checkpointPayload,
    }).catch(() => {});
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id, tid } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (member.accessKind === 'observer') {
    const observerReadDecision = evaluateObserverProjectReadPolicyAccess(auth.agent);
    if (!observerReadDecision.allowed) {
      return NextResponse.json(
        observerReadDecision.body || { error: 'Observer task visibility blocked by trust policy', code: 'TRUST_TIER_BLOCKED' } satisfies ApiError,
        { status: observerReadDecision.status || 403 }
      );
    }
  }

  const supabase = createServerClient();

  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', tid)
    .eq('project_id', id)
    .single();

  if (error || !task) {
    return NextResponse.json(
      { error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  // Enrich with dependencies, contracts, and agent info
  const [depsBlockingRes, depsBlockedRes, contractsRes, assigneeRes, reporterRes, sprintRes, executionRuns, checkpointRows, attachments, agentsRes] = await Promise.all([
    supabase
      .from('task_dependencies')
      .select('*, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status, project_id)')
      .eq('blocked_task_id', tid),
    supabase
      .from('task_dependencies')
      .select('*, blocked_task:tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id)')
      .eq('blocking_task_id', tid),
    supabase
      .from('task_contracts')
      .select('*, contract:contracts(id, title, status)')
      .eq('task_id', tid),
    task.assignee_agent_id
      ? supabase.from('agents').select('id, name, display_name').eq('id', task.assignee_agent_id).single()
      : Promise.resolve({ data: null }),
    task.reporter_agent_id
      ? supabase.from('agents').select('id, name, display_name').eq('id', task.reporter_agent_id).single()
      : Promise.resolve({ data: null }),
    task.sprint_id
      ? supabase.from('sprints').select('id, title, status').eq('id', task.sprint_id).single()
      : Promise.resolve({ data: null }),
    listTaskExecutionRuns(tid).catch(() => []),
    listTaskExecutionRuns(tid)
      .then((runs) => {
        const runIds = runs.map((run) => run.id).filter(Boolean);
        if (runIds.length === 0) return [];
        return Promise.all(runIds.map((runId) => listTaskExecutionCheckpoints(runId).catch(() => []))).then((groups: TaskExecutionCheckpointRow[][]) =>
          groups.flat().sort((a, b) => {
            if (a.created_at === b.created_at) return b.sequence - a.sequence;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          })
        );
      })
      .catch(() => []),
    listAttachmentsForScope({ projectId: id, taskId: tid, includeSignedUrl: true }).catch(() => []),
    supabase.from('agents').select('id, name, display_name'),
  ]);

  // Filter dependencies to same-project tasks only
  const blockedBy = (depsBlockingRes.data || [])
    .filter(d => d.blocking_task?.project_id === id && d.dependency_type === 'blocks')
    .map(d => ({ id: d.blocking_task.id, title: d.blocking_task.title, status: d.blocking_task.status }));

  const blocks = (depsBlockedRes.data || [])
    .filter(d => d.blocked_task?.project_id === id && d.dependency_type === 'blocks')
    .map(d => ({ id: d.blocked_task.id, title: d.blocked_task.title, status: d.blocked_task.status }));

  const sequence_after = (depsBlockingRes.data || [])
    .filter(d => d.blocking_task?.project_id === id && d.dependency_type === 'sequence_after')
    .map(d => ({ id: d.blocking_task.id, title: d.blocking_task.title, status: d.blocking_task.status }));

  const sequence_before = (depsBlockedRes.data || [])
    .filter(d => d.blocked_task?.project_id === id && d.dependency_type === 'sequence_after')
    .map(d => ({ id: d.blocked_task.id, title: d.blocked_task.title, status: d.blocked_task.status }));

  const relates_to = [
    ...(depsBlockingRes.data || [])
      .filter(d => d.blocking_task?.project_id === id && d.dependency_type === 'relates_to')
      .map(d => ({ id: d.blocking_task.id, title: d.blocking_task.title, status: d.blocking_task.status })),
    ...(depsBlockedRes.data || [])
      .filter(d => d.blocked_task?.project_id === id && d.dependency_type === 'relates_to')
      .map(d => ({ id: d.blocked_task.id, title: d.blocked_task.title, status: d.blocked_task.status })),
  ];

  // Filter linked contracts to ones the caller participates in
  const contractIds = (contractsRes.data || []).map(d => d.contract?.id).filter(Boolean);
  let visibleContractIds = new Set<string>();
  if (contractIds.length > 0) {
    const { data: participation } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .eq('agent_id', auth.agent.id)
      .in('contract_id', contractIds);
    visibleContractIds = new Set((participation || []).map(p => p.contract_id));
  }

  const agentMap = new Map(((agentsRes.data || []) as Array<{ id: string; name: string; display_name: string }>).map((agent) => [agent.id, agent]));
  const hydrateDelegationAgent = (record: Record<string, unknown> | null | undefined) => {
    const delegatedByAgentId = typeof record?.delegated_by_agent_id === 'string'
      ? record.delegated_by_agent_id
      : typeof record?.claimed_from_agent_id === 'string'
        ? record.claimed_from_agent_id
        : null;
    return delegatedByAgentId ? agentMap.get(delegatedByAgentId) || null : null;
  };

  const hydrateBrokerAgent = (record: Record<string, unknown> | null | undefined) => {
    const provenance = getEscalationBrokerageProvenance(record);
    return provenance?.brokerAgentId ? agentMap.get(provenance.brokerAgentId) || null : null;
  };

  return NextResponse.json({
    ...task,
    blocked_by: blockedBy,
    blocks: blocks,
    sequence_after,
    sequence_before,
    relates_to,
    linked_contracts: (contractsRes.data || [])
      .filter(d => d.contract?.id && visibleContractIds.has(d.contract.id))
      .map(d => d.contract),
    assignee: assigneeRes.data || null,
    reporter: reporterRes.data || null,
    sprint: sprintRes.data || null,
    execution_runs: (executionRuns || []).map((run) => ({
      ...run,
      agent: agentMap.get(run.agent_id) || null,
      delegated_by_agent: hydrateDelegationAgent((run.metadata || {}) as Record<string, unknown>),
      observer_agent: (() => {
        const observerAgentId = typeof run.metadata?.observer_agent_id === 'string' ? run.metadata.observer_agent_id : null;
        return observerAgentId ? agentMap.get(observerAgentId) || null : null;
      })(),
      broker_agent: hydrateBrokerAgent((run.metadata || {}) as Record<string, unknown>),
    })),
    execution_checkpoints: (checkpointRows || []).map((checkpoint) => ({
      ...checkpoint,
      agent: agentMap.get(checkpoint.agent_id) || null,
      delegated_by_agent: hydrateDelegationAgent((checkpoint.payload || {}) as Record<string, unknown>),
      observer_agent: (() => {
        const payload = (checkpoint.payload || {}) as Record<string, unknown>;
        const observerAgentId = typeof payload.observer_agent_id === 'string' ? payload.observer_agent_id : null;
        return observerAgentId ? agentMap.get(observerAgentId) || null : null;
      })(),
      broker_agent: hydrateBrokerAgent((checkpoint.payload || {}) as Record<string, unknown>),
    })),
    task_activity: await listTaskActivityEvents(tid).catch(() => []),
    attachments,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id, tid } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (member.accessKind === 'observer') {
    return NextResponse.json(
      { error: 'Observers may not mutate task state', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: UpdateTaskRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.title !== undefined) updates.title = parsed.title;
  if (parsed.description !== undefined) updates.description = parsed.description;
  if (parsed.status !== undefined) {
    const validStatuses = ['backlog', 'todo', 'in-progress', 'in-review', 'done', 'cancelled'];
    if (!validStatuses.includes(parsed.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
    updates.status = parsed.status;
  }
  if (parsed.priority !== undefined) {
    const validPriorities = ['urgent', 'high', 'medium', 'low'];
    if (!validPriorities.includes(parsed.priority)) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
    updates.priority = parsed.priority;
  }
  if ('sprint_id' in parsed) updates.sprint_id = parsed.sprint_id;
  if ('assignee_agent_id' in parsed) updates.assignee_agent_id = parsed.assignee_agent_id;
  if (parsed.labels !== undefined) updates.labels = parsed.labels;
  if ('due_date' in parsed) updates.due_date = parsed.due_date;
  if (parsed.position !== undefined) updates.position = parsed.position;

  const handoffInvitees = parsed.handoff_contract?.invitees;
  if (parsed.handoff_contract && (!Array.isArray(handoffInvitees) || handoffInvitees.length === 0)) {
    return NextResponse.json(
      { error: 'handoff_contract.invitees must be a non-empty array', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const escalationBrokers = parsed.escalation_contract?.brokers;
  if (parsed.escalation_contract && (!Array.isArray(escalationBrokers) || escalationBrokers.length === 0)) {
    return NextResponse.json(
      { error: 'escalation_contract.brokers must be a non-empty array', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (Object.keys(updates).length === 0 && !parsed.handoff_contract && !parsed.escalation_contract) {
    return NextResponse.json(
      { error: 'No fields to update', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  if ('assignee_agent_id' in updates && updates.assignee_agent_id) {
    const { data: assigneeMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', id)
      .eq('agent_id', updates.assignee_agent_id as string)
      .single();

    if (!assigneeMember) {
      return NextResponse.json(
        { error: 'Assignee must be a member of this project', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  // Fetch existing task for change detection (activity feed)
  const { data: oldTask } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', tid)
    .eq('project_id', id)
    .single();

  // Validate sprint belongs to same project
  if (updates.sprint_id) {
    const { data: sprint } = await supabase
      .from('sprints')
      .select('id')
      .eq('id', updates.sprint_id as string)
      .eq('project_id', id)
      .single();

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found in this project', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  const taskResult = Object.keys(updates).length > 0
    ? await supabase
        .from('tasks')
        .update(updates)
        .eq('id', tid)
        .eq('project_id', id)
        .select()
        .single()
    : await supabase
        .from('tasks')
        .select('*')
        .eq('id', tid)
        .eq('project_id', id)
        .single();

  const { data: task, error } = taskResult;

  if (error || !task) {
    return NextResponse.json(
      { error: 'Failed to update task', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  let handoffContract: Record<string, unknown> | null = null;
  let escalationContract: Record<string, unknown> | null = null;
  if (parsed.handoff_contract) {
    const normalizedInvitees = [...new Set(parsed.handoff_contract.invitees.map((invitee) => invitee.trim()).filter(Boolean))];
    if (normalizedInvitees.includes(auth.agent.name)) {
      return NextResponse.json(
        { error: 'Cannot invite yourself to a handoff contract', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    const { data: inviteeAgents, error: inviteeError } = await supabase
      .from('agents')
      .select('id, name, display_name, owner_user_id')
      .in('name', normalizedInvitees);

    if (inviteeError) {
      return NextResponse.json(
        { error: 'Failed to validate handoff invitees', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const foundNames = new Set((inviteeAgents || []).map((agent) => agent.name));
    const missing = normalizedInvitees.filter((name) => !foundNames.has(name));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown handoff invitee(s): ${missing.join(', ')}`, code: 'INVALID_INVITEES' } satisfies ApiError,
        { status: 400 }
      );
    }

    for (const invitee of inviteeAgents || []) {
      const trustGate = evaluateHandoffInvite(auth.agent, invitee);
      if (!trustGate.allowed) {
        return NextResponse.json(
          { error: `${invitee.name}: ${trustGate.reason}`, code: 'TRUST_TIER_BLOCKED' } satisfies ApiError,
          { status: 403 }
        );
      }
    }

    const [runs, attachments, taskContracts] = await Promise.all([
      listTaskExecutionRuns(tid).catch(() => []),
      listAttachmentsForScope({ projectId: id, taskId: tid, includeSignedUrl: false }).catch(() => []),
      supabase
        .from('task_contracts')
        .select('contract_id, contract:contracts(id, title, status, description)')
        .eq('task_id', tid),
    ]);

    const activeRun = task.active_run_id ? runs.find((run) => run.id === task.active_run_id) ?? null : runs[0] ?? null;
    const checkpoints = activeRun
      ? await listTaskExecutionCheckpoints(activeRun.id).catch(() => [])
      : [];

    const priorHandoffs: HandoffContractSummary[] = ((taskContracts.data || []) as Array<Record<string, unknown>>)
      .map((row) => row.contract as { id: string; title: string; status: string; description?: string | null } | null)
      .filter((contract): contract is { id: string; title: string; status: string; description?: string | null } => !!contract)
      .filter((contract) => isLikelyHandoffContract({ title: contract.title, description: contract.description || null } as never))
      .map((contract) => ({
        contractId: contract.id,
        title: contract.title,
        status: contract.status,
        linkedTaskId: tid,
        linkedTaskTitle: task.title,
      }));

    const expiresInHours = parsed.handoff_contract.expires_in_hours ?? 168;
    const maxTurns = parsed.handoff_contract.max_turns ?? 30;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const contractTitle = parsed.handoff_contract.title || buildHandoffContractTitle(task.title);
    const contractDescription = parsed.handoff_contract.description || buildHandoffContractDescription({
      task,
      run: activeRun,
      checkpoints,
      attachments,
      priorHandoffs,
    });

    const { data: createdContract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        title: contractTitle,
        description: contractDescription,
        status: 'proposed',
        proposer_id: auth.agent.id,
        max_turns: maxTurns,
        current_turns: 0,
        expires_at: expiresAt,
        message_schema: null,
      })
      .select()
      .single();

    if (contractError || !createdContract) {
      return NextResponse.json(
        { error: 'Failed to create handoff contract', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const participantRows = [
      {
        contract_id: createdContract.id,
        agent_id: auth.agent.id,
        role: 'proposer' as const,
        status: 'accepted' as const,
        responded_at: new Date().toISOString(),
      },
      ...(inviteeAgents || []).map((agent) => ({
        contract_id: createdContract.id,
        agent_id: agent.id,
        role: 'invitee' as const,
        status: 'pending' as const,
        responded_at: null,
      })),
    ];

    const { error: participantError } = await supabase.from('contract_participants').insert(participantRows);
    if (participantError) {
      await supabase.from('contracts').delete().eq('id', createdContract.id);
      return NextResponse.json(
        { error: 'Failed to create handoff contract participants', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const { error: linkError } = await supabase.from('task_contracts').insert({ task_id: tid, contract_id: createdContract.id });
    if (linkError) {
      await supabase.from('contract_participants').delete().eq('contract_id', createdContract.id);
      await supabase.from('contracts').delete().eq('id', createdContract.id);
      return NextResponse.json(
        { error: 'Failed to link handoff contract to task', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    handoffContract = createdContract;

    async function appendTaskCommentForHandoff() {
      await supabase.from('task_comments').insert({
        task_id: tid,
        project_id: id,
        author_agent_id: auth.agent.id,
        author_name: auth.agent.display_name || auth.agent.name,
        content: `Proposed handoff contract \`${createdContract.id}\` for ${normalizedInvitees.join(', ')}.`,
        comment_type: 'system',
        metadata: { handoff_contract_id: createdContract.id, invitees: normalizedInvitees },
      });
    }

    if (activeRun?.id) {
      await updateTaskExecutionRun({
        runId: activeRun.id,
        taskId: tid,
        status: 'handoff-needed',
        summary: activeRun.summary ?? task.last_checkpoint_summary ?? 'Handoff contract proposed',
        metadata: { ...activeRun.metadata, handoff_contract_id: createdContract.id, handoff_invitees: normalizedInvitees },
      }).catch(() => {});

      await appendTaskCheckpoint({
        runId: activeRun.id,
        taskId: tid,
        projectId: id,
        agentId: auth.agent.id,
        checkpointKey: 'handoff-contract',
        summary: `Handoff contract ${createdContract.id} proposed`,
        payload: {
          handoff_contract_id: createdContract.id,
          invitees: normalizedInvitees,
          contract_title: createdContract.title,
        },
      }).catch(() => {});
    }

    await appendTaskCommentForHandoff();

    deliverWebhooks((inviteeAgents || []).map((agent) => agent.id), {
      event: 'invitation',
      contract_id: createdContract.id,
      project_id: id,
      task_id: tid,
      data: { title: createdContract.title, proposer: auth.agent.name, expires_at: expiresAt, handoff: true },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  if (parsed.escalation_contract) {
    const normalizedBrokers = [...new Set(parsed.escalation_contract.brokers.map((broker) => broker.trim()).filter(Boolean))];
    if (normalizedBrokers.includes(auth.agent.name)) {
      return NextResponse.json(
        { error: 'Cannot broker-escalate to yourself', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    const { data: brokerAgents, error: brokerError } = await supabase
      .from('agents')
      .select('id, name, display_name, owner_user_id')
      .in('name', normalizedBrokers);

    if (brokerError) {
      return NextResponse.json(
        { error: 'Failed to validate escalation brokers', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const foundNames = new Set((brokerAgents || []).map((agent) => agent.name));
    const missing = normalizedBrokers.filter((name) => !foundNames.has(name));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown escalation broker(s): ${missing.join(', ')}`, code: 'INVALID_INVITEES' } satisfies ApiError,
        { status: 400 }
      );
    }

    for (const broker of brokerAgents || []) {
      const trustGate = evaluateEscalationBroker(auth.agent, broker);
      if (!trustGate.allowed) {
        return NextResponse.json(
          { error: `${broker.name}: ${trustGate.reason}`, code: 'TRUST_TIER_BLOCKED' } satisfies ApiError,
          { status: 403 }
        );
      }
    }

    const [runs, attachments, taskContracts] = await Promise.all([
      listTaskExecutionRuns(tid).catch(() => []),
      listAttachmentsForScope({ projectId: id, taskId: tid, includeSignedUrl: false }).catch(() => []),
      supabase
        .from('task_contracts')
        .select('contract_id, contract:contracts(id, title, status, description)')
        .eq('task_id', tid),
    ]);

    const activeRun = task.active_run_id ? runs.find((run) => run.id === task.active_run_id) ?? null : runs[0] ?? null;
    const checkpoints = activeRun
      ? await listTaskExecutionCheckpoints(activeRun.id).catch(() => [])
      : [];

    const priorBrokerContracts: BrokerContractSummary[] = ((taskContracts.data || []) as Array<Record<string, unknown>>)
      .map((row) => row.contract as { id: string; title: string; status: string; description?: string | null } | null)
      .filter((contract): contract is { id: string; title: string; status: string; description?: string | null } => !!contract)
      .filter((contract) => isLikelyBrokerContract({ title: contract.title, description: contract.description || null } as never))
      .map((contract) => ({
        contractId: contract.id,
        title: contract.title,
        status: contract.status,
        linkedTaskId: tid,
        linkedTaskTitle: task.title,
      }));

    const expiresInHours = parsed.escalation_contract.expires_in_hours ?? 168;
    const maxTurns = parsed.escalation_contract.max_turns ?? 30;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const contractTitle = parsed.escalation_contract.title || buildBrokeredCollaborationTitle(task.title);
    const contractDescription = parsed.escalation_contract.description || buildBrokeredCollaborationDescription({
      task,
      run: activeRun,
      checkpoints,
      attachments,
      priorBrokerContracts,
      escalationReason: parsed.escalation_contract.escalation_reason ?? task.last_checkpoint_summary ?? activeRun?.summary ?? null,
      requestedIntervention: parsed.escalation_contract.requested_intervention ?? 'Broker intervention requested to resolve a blocker/risk without losing executor provenance.',
      brokerAgentNames: normalizedBrokers,
    });

    const { data: createdContract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        title: contractTitle,
        description: contractDescription,
        status: 'proposed',
        proposer_id: auth.agent.id,
        max_turns: maxTurns,
        current_turns: 0,
        expires_at: expiresAt,
        message_schema: null,
      })
      .select()
      .single();

    if (contractError || !createdContract) {
      return NextResponse.json(
        { error: 'Failed to create escalation contract', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const participantRows = [
      {
        contract_id: createdContract.id,
        agent_id: auth.agent.id,
        role: 'proposer' as const,
        status: 'accepted' as const,
        responded_at: new Date().toISOString(),
      },
      ...(brokerAgents || []).map((agent) => ({
        contract_id: createdContract.id,
        agent_id: agent.id,
        role: 'invitee' as const,
        status: 'pending' as const,
        responded_at: null,
      })),
    ];

    const { error: participantError } = await supabase.from('contract_participants').insert(participantRows);
    if (participantError) {
      await supabase.from('contracts').delete().eq('id', createdContract.id);
      return NextResponse.json(
        { error: 'Failed to create escalation contract participants', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const { error: linkError } = await supabase.from('task_contracts').insert({ task_id: tid, contract_id: createdContract.id });
    if (linkError) {
      await supabase.from('contract_participants').delete().eq('contract_id', createdContract.id);
      await supabase.from('contracts').delete().eq('id', createdContract.id);
      return NextResponse.json(
        { error: 'Failed to link escalation contract to task', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    escalationContract = createdContract;

    const escalationReason = parsed.escalation_contract.escalation_reason ?? task.last_checkpoint_summary ?? activeRun?.summary ?? 'Escalation requested';
    const requestedIntervention = parsed.escalation_contract.requested_intervention ?? 'Broker intervention requested';

    if (activeRun?.id) {
      await updateTaskExecutionRun({
        runId: activeRun.id,
        taskId: tid,
        status: 'blocked',
        summary: activeRun.summary ?? task.last_checkpoint_summary ?? 'Escalation requested',
        metadata: {
          ...activeRun.metadata,
          escalation_contract_id: createdContract.id,
          broker_agent_id: (brokerAgents || [])[0]?.id ?? null,
          broker_agent_ids: normalizedBrokers,
          escalation_requested_by_agent_id: auth.agent.id,
          escalation_requested_at: new Date().toISOString(),
          escalation_reason: escalationReason,
          requested_intervention: requestedIntervention,
          collaboration_mode: 'brokered-collaboration',
          escalation_status: 'requested',
        },
      }).catch(() => {});

      await appendTaskCheckpoint({
        runId: activeRun.id,
        taskId: tid,
        projectId: id,
        agentId: auth.agent.id,
        checkpointKey: 'broker-escalation',
        summary: `Escalation contract ${createdContract.id} proposed`,
        payload: {
          escalation_contract_id: createdContract.id,
          broker_agent_id: (brokerAgents || [])[0]?.id ?? null,
          broker_agent_ids: normalizedBrokers,
          escalation_requested_by_agent_id: auth.agent.id,
          escalation_requested_at: new Date().toISOString(),
          escalation_reason: escalationReason,
          requested_intervention: requestedIntervention,
          collaboration_mode: 'brokered-collaboration',
          escalation_status: 'requested',
        },
      }).catch(() => {});
    }

    await supabase.from('task_comments').insert({
      task_id: tid,
      project_id: id,
      author_agent_id: auth.agent.id,
      author_name: auth.agent.display_name || auth.agent.name,
      content: `Requested brokered escalation via contract \`${createdContract.id}\` for ${normalizedBrokers.join(', ')}.`,
      comment_type: 'system',
      metadata: {
        escalation_contract_id: createdContract.id,
        broker_agent_ids: (brokerAgents || []).map((agent) => agent.id),
        broker_names: normalizedBrokers,
        escalation_requested_by_agent_id: auth.agent.id,
        escalation_reason: escalationReason,
        requested_intervention: requestedIntervention,
        collaboration_mode: 'brokered-collaboration',
        escalation_status: 'requested',
      },
    });

    deliverWebhooks((brokerAgents || []).map((agent) => agent.id), {
      event: 'invitation',
      contract_id: createdContract.id,
      project_id: id,
      task_id: tid,
      data: {
        title: createdContract.title,
        proposer: auth.agent.name,
        expires_at: expiresAt,
        escalation: true,
        brokered_collaboration: true,
        escalation_reason: escalationReason,
        requested_intervention: requestedIntervention,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  await syncTaskExecutionForStatusChange({
    taskId: tid,
    projectId: id,
    oldTask: oldTask || null,
    task,
    actor: auth.agent,
  });

  await auditLog({
    actor: auth.agent.name,
    action: 'task.update',
    resourceType: 'task',
    resourceId: tid,
    details: { project_id: id, ...updates, handoff_contract_id: handoffContract?.id || null, escalation_contract_id: escalationContract?.id || null },
    ipAddress: getClientIp(req),
  });

  const taskActivityWrites: Promise<unknown>[] = [];

  // Auto-generate activity comments for notable changes
  if (oldTask) {
    const actorName = auth.agent.display_name || auth.agent.name;
    const activityComments: Array<{ content: string; comment_type: string; metadata: Record<string, unknown> }> = [];

    if (updates.status && updates.status !== oldTask.status) {
      activityComments.push({
        content: `Status changed from '${oldTask.status}' to '${updates.status}'`,
        comment_type: 'status_change',
        metadata: { old_status: oldTask.status, new_status: updates.status },
      });
      taskActivityWrites.push(
        appendTaskActivityEvent({
          projectId: id,
          taskId: tid,
          actorAgentId: auth.agent.id,
          eventType: 'status_change',
          summary: `Status changed from ${oldTask.status} to ${updates.status}`,
          metadata: { old_status: oldTask.status, new_status: updates.status },
        })
      );
    }

    if ('assignee_agent_id' in updates && updates.assignee_agent_id !== oldTask.assignee_agent_id) {
      if (updates.assignee_agent_id) {
        // Look up assignee name
        const { data: assignee } = await supabase
          .from('agents')
          .select('name, display_name')
          .eq('id', updates.assignee_agent_id as string)
          .single();
        const assigneeName = assignee?.display_name || assignee?.name || 'Unknown';
        activityComments.push({
          content: `Assigned to ${assigneeName}`,
          comment_type: 'assignment',
          metadata: { old_assignee: oldTask.assignee_agent_id, new_assignee: updates.assignee_agent_id },
        });
        taskActivityWrites.push(
          appendTaskActivityEvent({
            projectId: id,
            taskId: tid,
            actorAgentId: auth.agent.id,
            eventType: 'assignment',
            summary: `Assigned to ${assigneeName}`,
            metadata: { old_assignee: oldTask.assignee_agent_id, new_assignee: updates.assignee_agent_id },
          })
        );
      } else {
        activityComments.push({
          content: 'Assignee removed',
          comment_type: 'assignment',
          metadata: { old_assignee: oldTask.assignee_agent_id, new_assignee: null },
        });
        taskActivityWrites.push(
          appendTaskActivityEvent({
            projectId: id,
            taskId: tid,
            actorAgentId: auth.agent.id,
            eventType: 'assignment',
            summary: 'Assignee removed',
            metadata: { old_assignee: oldTask.assignee_agent_id, new_assignee: null },
          })
        );
      }
    }

    if (updates.priority && updates.priority !== oldTask.priority) {
      activityComments.push({
        content: `Priority changed to ${updates.priority}`,
        comment_type: 'system',
        metadata: { old_priority: oldTask.priority, new_priority: updates.priority },
      });
      taskActivityWrites.push(
        appendTaskActivityEvent({
          projectId: id,
          taskId: tid,
          actorAgentId: auth.agent.id,
          eventType: 'priority_change',
          summary: `Priority changed to ${updates.priority}`,
          metadata: { old_priority: oldTask.priority, new_priority: updates.priority },
        })
      );
    }

    if (activityComments.length > 0) {
      const rows = activityComments.map(c => ({
        task_id: tid,
        project_id: id,
        author_agent_id: auth.agent.id,
        author_name: actorName,
        ...c,
      }));
      await supabase.from('task_comments').insert(rows);
    }
  }

  if (handoffContract) {
    taskActivityWrites.push(
      appendTaskActivityEvent({
        projectId: id,
        taskId: tid,
        actorAgentId: auth.agent.id,
        eventType: 'handoff_contract',
        summary: `Handoff contract ${handoffContract.id} proposed`,
        metadata: { handoff_contract_id: handoffContract.id },
      })
    );
  }

  if (escalationContract) {
    taskActivityWrites.push(
      appendTaskActivityEvent({
        projectId: id,
        taskId: tid,
        actorAgentId: auth.agent.id,
        eventType: 'escalation_contract',
        summary: `Escalation contract ${escalationContract.id} proposed`,
        metadata: { escalation_contract_id: escalationContract.id },
      })
    );
  }

  await Promise.all(taskActivityWrites.map((p) => p.catch(() => null)));

  // Deliver webhook notifications to all project members (fire-and-forget)
  getProjectVisibleAgentIds(id).then(memberIds => {
    deliverWebhooks(memberIds, {
      event: 'task.updated',
      project_id: id,
      task_id: tid,
      data: { title: task.title, updated_by: auth.agent.name, changes: updates },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }).catch(() => {});

  await refreshTaskBlockedState(supabase, tid).catch(() => {});

  if ('assignee_agent_id' in updates && updates.assignee_agent_id !== oldTask?.assignee_agent_id && task.assignee_agent_id) {
    notifyAssigneeOwner(supabase, {
      assigneeAgentId: task.assignee_agent_id,
      projectId: id,
      taskId: tid,
      taskTitle: task.title,
      priority: task.priority || 'medium',
    }).catch(() => {});
  }

  const { data: refreshedTask } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', tid)
    .eq('project_id', id)
    .single();

  return NextResponse.json(
    handoffContract || escalationContract
      ? {
          ...(refreshedTask || task),
          ...(handoffContract ? { handoff_contract: handoffContract } : {}),
          ...(escalationContract ? { escalation_contract: escalationContract } : {}),
        }
      : (refreshedTask || task)
  );
}
