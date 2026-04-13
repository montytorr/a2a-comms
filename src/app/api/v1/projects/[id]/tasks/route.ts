import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '../../_helpers';
import { getProjectAccess } from '@/lib/project-access';
import { sendTaskAssignedEmail } from '@/lib/email';
import { getUserEmail } from '@/lib/email/helpers';
import { buildHandoffContractDescription, buildHandoffContractTitle } from '@/lib/handoff-contracts';
import { buildBrokeredCollaborationDescription, buildBrokeredCollaborationTitle } from '@/lib/escalation-brokerage';
import { evaluateEscalationBroker, evaluateHandoffInvite } from '@/lib/trust-tiers';
import { appendTaskActivityEvent } from '@/lib/task-activity';

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
import type {
  CreateTaskRequest,
  PaginatedResponse,
  Task,
  ApiError,
} from '@/lib/types';

async function verifyMembership(projectId: string, agentId: string) {
  return getProjectAccess(projectId, agentId);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;
  const url = new URL(req.url);

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const status = url.searchParams.get('status');
  const sprint_id = url.searchParams.get('sprint_id');
  const assignee = url.searchParams.get('assignee') || url.searchParams.get('assignee_agent_id');
  const priority = url.searchParams.get('priority');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10)));

  const supabase = createServerClient();

  let query = supabase
    .from('tasks')
    .select('id, project_id, sprint_id, title, description, status, priority, assignee_agent_id, reporter_agent_id, labels, due_date, position, active_run_id, execution_status, execution_started_at, execution_heartbeat_at, execution_completed_at, last_checkpoint_at, last_checkpoint_summary, last_checkpoint_payload, blocked_at, blocker_follow_up_at, blocker_followed_through_at, blocker_escalated_at, created_at, updated_at', { count: 'exact' })
    .eq('project_id', id);

  if (status) query = query.eq('status', status);
  if (sprint_id) {
    if (sprint_id === 'null') {
      query = query.is('sprint_id', null);
    } else {
      query = query.eq('sprint_id', sprint_id);
    }
  }
  if (assignee) query = query.eq('assignee_agent_id', assignee);
  if (priority) query = query.eq('priority', priority);

  query = query
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  const { data: tasks, count, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch tasks', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: tasks || [],
    total: count || 0,
    page,
    per_page: perPage,
  } satisfies PaginatedResponse<Task>);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  // Idempotency check
  const endpoint = `POST /v1/projects/${id}/tasks`;
  const idempotency = await checkIdempotency(req, auth, endpoint);
  if (idempotency.cachedResponse) return idempotency.cachedResponse;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (member.accessKind === 'observer') {
    return NextResponse.json(
      { error: 'Observers may inspect project tasks but cannot create new ones', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: CreateTaskRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.title) {
    return NextResponse.json(
      { error: 'Missing required field: title', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

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

  // Validate priority
  if (parsed.priority) {
    const validPriorities = ['urgent', 'high', 'medium', 'low'];
    if (!validPriorities.includes(parsed.priority)) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  const supabase = createServerClient();

  let handoffInviteeAgents: Array<{ id: string; name: string; display_name: string; max_concurrent_contracts: number | null; owner_user_id?: string | null }> = [];
  let escalationBrokerAgents: Array<{ id: string; name: string; display_name: string; max_concurrent_contracts: number | null; owner_user_id?: string | null }> = [];
  if (parsed.handoff_contract) {
    const invitees = [...new Set(parsed.handoff_contract.invitees.map((invitee) => invitee.trim()).filter(Boolean))];
    if (invitees.includes(auth.agent.name)) {
      return NextResponse.json(
        { error: 'Cannot invite yourself to a handoff contract', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    const { data: inviteeAgents, error: inviteeError } = await supabase
      .from('agents')
      .select('id, name, display_name, max_concurrent_contracts, owner_user_id')
      .in('name', invitees);

    if (inviteeError) {
      return NextResponse.json(
        { error: 'Failed to validate handoff invitees', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const foundNames = new Set((inviteeAgents || []).map((agent) => agent.name));
    const missing = invitees.filter((name) => !foundNames.has(name));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown handoff invitee(s): ${missing.join(', ')}`, code: 'INVALID_INVITEES' } satisfies ApiError,
        { status: 400 }
      );
    }

    handoffInviteeAgents = inviteeAgents || [];
    for (const invitee of handoffInviteeAgents) {
      const trustGate = evaluateHandoffInvite(auth.agent, invitee);
      if (!trustGate.allowed) {
        return NextResponse.json(
          { error: `${invitee.name}: ${trustGate.reason}`, code: 'TRUST_TIER_BLOCKED' } satisfies ApiError,
          { status: 403 }
        );
      }
    }
  }

  if (parsed.escalation_contract) {
    const brokers = [...new Set(parsed.escalation_contract.brokers.map((broker) => broker.trim()).filter(Boolean))];
    if (brokers.includes(auth.agent.name)) {
      return NextResponse.json(
        { error: 'Cannot broker-escalate to yourself', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    const { data: brokerAgents, error: brokerError } = await supabase
      .from('agents')
      .select('id, name, display_name, max_concurrent_contracts, owner_user_id')
      .in('name', brokers);

    if (brokerError) {
      return NextResponse.json(
        { error: 'Failed to validate escalation brokers', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const foundNames = new Set((brokerAgents || []).map((agent) => agent.name));
    const missing = brokers.filter((name) => !foundNames.has(name));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown escalation broker(s): ${missing.join(', ')}`, code: 'INVALID_INVITEES' } satisfies ApiError,
        { status: 400 }
      );
    }

    escalationBrokerAgents = brokerAgents || [];
    for (const broker of escalationBrokerAgents) {
      const trustGate = evaluateEscalationBroker(auth.agent, broker);
      if (!trustGate.allowed) {
        return NextResponse.json(
          { error: `${broker.name}: ${trustGate.reason}`, code: 'TRUST_TIER_BLOCKED' } satisfies ApiError,
          { status: 403 }
        );
      }
    }
  }

  // Validate sprint belongs to same project
  if (parsed.sprint_id) {
    const { data: sprint } = await supabase
      .from('sprints')
      .select('id')
      .eq('id', parsed.sprint_id)
      .eq('project_id', id)
      .single();

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found in this project', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  // Validate assignee is an actual project member
  if (parsed.assignee_agent_id) {
    const { data: assigneeMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', id)
      .eq('agent_id', parsed.assignee_agent_id)
      .single();

    if (!assigneeMember) {
      return NextResponse.json(
        { error: 'Assignee must be a member of this project', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  // Get next position
  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('position')
    .eq('project_id', id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existingTasks && existingTasks.length > 0
    ? existingTasks[0].position + 1
    : 0;

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      project_id: id,
      sprint_id: parsed.sprint_id || null,
      title: parsed.title,
      description: parsed.description || null,
      priority: parsed.priority || 'medium',
      assignee_agent_id: parsed.assignee_agent_id || null,
      reporter_agent_id: auth.agent.id,
      labels: parsed.labels || [],
      due_date: parsed.due_date || null,
      position: nextPosition,
    })
    .select()
    .single();

  if (error || !task) {
    return NextResponse.json(
      { error: 'Failed to create task', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  let handoffContract: Record<string, unknown> | null = null;
  let escalationContract: Record<string, unknown> | null = null;
  if (parsed.handoff_contract) {
    const expiresInHours = parsed.handoff_contract.expires_in_hours ?? 168;
    const maxTurns = parsed.handoff_contract.max_turns ?? 30;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const handoffDescription = parsed.handoff_contract.description || buildHandoffContractDescription({
      task,
      run: null,
      checkpoints: [],
      attachments: [],
      priorHandoffs: [],
    });

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        title: parsed.handoff_contract.title || buildHandoffContractTitle(task.title),
        description: handoffDescription,
        status: 'proposed',
        proposer_id: auth.agent.id,
        max_turns: maxTurns,
        current_turns: 0,
        expires_at: expiresAt,
        message_schema: null,
      })
      .select()
      .single();

    if (contractError || !contract) {
      await supabase.from('tasks').delete().eq('id', task.id).eq('project_id', id);
      return NextResponse.json(
        { error: 'Failed to create handoff contract', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const participants = [
      {
        contract_id: contract.id,
        agent_id: auth.agent.id,
        role: 'proposer' as const,
        status: 'accepted' as const,
        responded_at: new Date().toISOString(),
      },
      ...handoffInviteeAgents.map((agent) => ({
        contract_id: contract.id,
        agent_id: agent.id,
        role: 'invitee' as const,
        status: 'pending' as const,
        responded_at: null,
      })),
    ];

    const { error: participantError } = await supabase.from('contract_participants').insert(participants);
    if (participantError) {
      await supabase.from('contracts').delete().eq('id', contract.id);
      await supabase.from('tasks').delete().eq('id', task.id).eq('project_id', id);
      return NextResponse.json(
        { error: 'Failed to create handoff contract participants', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const { error: linkError } = await supabase.from('task_contracts').insert({ task_id: task.id, contract_id: contract.id });
    if (linkError) {
      await supabase.from('contract_participants').delete().eq('contract_id', contract.id);
      await supabase.from('contracts').delete().eq('id', contract.id);
      await supabase.from('tasks').delete().eq('id', task.id).eq('project_id', id);
      return NextResponse.json(
        { error: 'Failed to link handoff contract to task', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    handoffContract = contract;

    const inviteeIds = handoffInviteeAgents.map((agent) => agent.id);
    deliverWebhooks(inviteeIds, {
      event: 'invitation',
      contract_id: contract.id,
      project_id: id,
      task_id: task.id,
      data: { title: contract.title, proposer: auth.agent.name, expires_at: expiresAt, handoff: true },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    Promise.all(
      handoffInviteeAgents.map(async (agent) => {
        if (!agent.owner_user_id) return;
        const email = await getUserEmail(agent.owner_user_id);
        if (!email) return;
        await sendTaskAssignedEmail(
          email,
          {
            taskTitle: task.title,
            projectName: 'Task handoff',
            priority: task.priority || 'medium',
            taskUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://a2a.playground.montytorr.tech'}/contracts/${contract.id}`,
          },
          agent.owner_user_id
        );
      })
    ).catch(() => {});
  }

  if (parsed.escalation_contract) {
    const expiresInHours = parsed.escalation_contract.expires_in_hours ?? 168;
    const maxTurns = parsed.escalation_contract.max_turns ?? 30;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const escalationReason = parsed.escalation_contract.escalation_reason ?? 'Escalation requested during task creation';
    const requestedIntervention = parsed.escalation_contract.requested_intervention ?? 'Broker intervention requested to coordinate next steps safely.';
    const brokerNames = escalationBrokerAgents.map((agent) => agent.name);
    const escalationDescription = parsed.escalation_contract.description || buildBrokeredCollaborationDescription({
      task,
      run: null,
      checkpoints: [],
      attachments: [],
      priorBrokerContracts: [],
      escalationReason,
      requestedIntervention,
      brokerAgentNames: brokerNames,
    });

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        title: parsed.escalation_contract.title || buildBrokeredCollaborationTitle(task.title),
        description: escalationDescription,
        status: 'proposed',
        proposer_id: auth.agent.id,
        max_turns: maxTurns,
        current_turns: 0,
        expires_at: expiresAt,
        message_schema: null,
      })
      .select()
      .single();

    if (contractError || !contract) {
      await supabase.from('tasks').delete().eq('id', task.id).eq('project_id', id);
      return NextResponse.json(
        { error: 'Failed to create escalation contract', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const participants = [
      {
        contract_id: contract.id,
        agent_id: auth.agent.id,
        role: 'proposer' as const,
        status: 'accepted' as const,
        responded_at: new Date().toISOString(),
      },
      ...escalationBrokerAgents.map((agent) => ({
        contract_id: contract.id,
        agent_id: agent.id,
        role: 'invitee' as const,
        status: 'pending' as const,
        responded_at: null,
      })),
    ];

    const { error: participantError } = await supabase.from('contract_participants').insert(participants);
    if (participantError) {
      await supabase.from('contracts').delete().eq('id', contract.id);
      await supabase.from('tasks').delete().eq('id', task.id).eq('project_id', id);
      return NextResponse.json(
        { error: 'Failed to create escalation contract participants', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    const { error: linkError } = await supabase.from('task_contracts').insert({ task_id: task.id, contract_id: contract.id });
    if (linkError) {
      await supabase.from('contract_participants').delete().eq('contract_id', contract.id);
      await supabase.from('contracts').delete().eq('id', contract.id);
      await supabase.from('tasks').delete().eq('id', task.id).eq('project_id', id);
      return NextResponse.json(
        { error: 'Failed to link escalation contract to task', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    escalationContract = contract;

    await supabase.from('task_comments').insert({
      task_id: task.id,
      project_id: id,
      author_agent_id: auth.agent.id,
      author_name: auth.agent.display_name || auth.agent.name,
      content: `Requested brokered escalation via contract \`${contract.id}\` for ${brokerNames.join(', ')}.`,
      comment_type: 'system',
      metadata: {
        escalation_contract_id: contract.id,
        broker_agent_ids: escalationBrokerAgents.map((agent) => agent.id),
        broker_names: brokerNames,
        escalation_requested_by_agent_id: auth.agent.id,
        escalation_requested_at: new Date().toISOString(),
        escalation_reason: escalationReason,
        requested_intervention: requestedIntervention,
        collaboration_mode: 'brokered-collaboration',
        escalation_status: 'requested',
      },
    });

    deliverWebhooks(escalationBrokerAgents.map((agent) => agent.id), {
      event: 'invitation',
      contract_id: contract.id,
      project_id: id,
      task_id: task.id,
      data: {
        title: contract.title,
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

  await auditLog({
    actor: auth.agent.name,
    action: 'task.create',
    resourceType: 'task',
    resourceId: task.id,
    details: { project_id: id, title: parsed.title, priority: parsed.priority || 'medium', handoff_contract_id: handoffContract?.id || null, escalation_contract_id: escalationContract?.id || null },
    ipAddress: getClientIp(req),
  });

  const taskActivityWrites: Promise<unknown>[] = [
    appendTaskActivityEvent({
      projectId: id,
      taskId: task.id,
      actorAgentId: auth.agent.id,
      eventType: 'task_created',
      summary: `Task created${task.title ? `: ${task.title}` : ''}`,
      metadata: {
        priority: task.priority || 'medium',
        reporter_agent_id: auth.agent.id,
        assignee_agent_id: task.assignee_agent_id ?? null,
      },
    }),
  ];

  if (task.assignee_agent_id) {
    const assigneeName = handoffInviteeAgents.find((agent) => agent.id === task.assignee_agent_id)?.display_name
      || handoffInviteeAgents.find((agent) => agent.id === task.assignee_agent_id)?.name
      || escalationBrokerAgents.find((agent) => agent.id === task.assignee_agent_id)?.display_name
      || escalationBrokerAgents.find((agent) => agent.id === task.assignee_agent_id)?.name
      || null;

    taskActivityWrites.push(
      appendTaskActivityEvent({
        projectId: id,
        taskId: task.id,
        actorAgentId: auth.agent.id,
        eventType: 'assignment',
        summary: assigneeName ? `Assigned to ${assigneeName}` : 'Task assigned',
        metadata: {
          old_assignee: null,
          new_assignee: task.assignee_agent_id,
        },
      })
    );
  }

  if (handoffContract) {
    taskActivityWrites.push(
      appendTaskActivityEvent({
        projectId: id,
        taskId: task.id,
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
        taskId: task.id,
        actorAgentId: auth.agent.id,
        eventType: 'escalation_contract',
        summary: `Escalation contract ${escalationContract.id} proposed`,
        metadata: { escalation_contract_id: escalationContract.id },
      })
    );
  }

  await Promise.all(taskActivityWrites.map((p) => p.catch(() => null)));

  // Deliver webhook notifications to all project members (fire-and-forget)
  getProjectMemberAgentIds(id).then(memberIds => {
    deliverWebhooks(memberIds, {
      event: 'task.created',
      project_id: id,
      task_id: task.id,
      data: { title: parsed.title, priority: parsed.priority || 'medium', created_by: auth.agent.name },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }).catch(() => {});

  // Email notification to assignee owner (fire-and-forget)
  if (task.assignee_agent_id) {
    notifyAssigneeOwner(supabase, {
      assigneeAgentId: task.assignee_agent_id,
      projectId: id,
      taskId: task.id,
      taskTitle: task.title,
      priority: task.priority || 'medium',
    }).catch(() => {});
  }

  const responseBody = handoffContract || escalationContract
    ? {
        ...task,
        ...(handoffContract ? { handoff_contract: handoffContract } : {}),
        ...(escalationContract ? { escalation_contract: escalationContract } : {}),
      }
    : task;

  await storeIdempotencyResponse(idempotency.key, auth, `POST /v1/projects/${id}/tasks`, 201, responseBody);

  return NextResponse.json(responseBody, { status: 201 });
}
