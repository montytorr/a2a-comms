import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '../../../_helpers';
import { sendTaskAssignedEmail } from '@/lib/email';
import { getUserEmail } from '@/lib/email/helpers';
import { refreshTaskBlockedState } from '@/lib/task-blocker-actions';
import { listTaskExecutionCheckpoints, listTaskExecutionRuns } from '@/lib/task-execution';
import type { UpdateTaskRequest, ApiError } from '@/lib/types';

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
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();
  return data;
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
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
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
  const [depsBlockingRes, depsBlockedRes, contractsRes, assigneeRes, reporterRes, sprintRes, executionRuns, checkpointRows] = await Promise.all([
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
    task.active_run_id ? listTaskExecutionCheckpoints(task.active_run_id).catch(() => []) : Promise.resolve([]),
  ]);

  // Filter dependencies to same-project tasks only
  const blockedBy = (depsBlockingRes.data || [])
    .filter(d => d.blocking_task?.project_id === id)
    .map(d => ({ id: d.blocking_task.id, title: d.blocking_task.title, status: d.blocking_task.status }));

  const blocks = (depsBlockedRes.data || [])
    .filter(d => d.blocked_task?.project_id === id)
    .map(d => ({ id: d.blocked_task.id, title: d.blocked_task.title, status: d.blocked_task.status }));

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

  return NextResponse.json({
    ...task,
    blocked_by: blockedBy,
    blocks: blocks,
    linked_contracts: (contractsRes.data || [])
      .filter(d => d.contract?.id && visibleContractIds.has(d.contract.id))
      .map(d => d.contract),
    assignee: assigneeRes.data || null,
    reporter: reporterRes.data || null,
    sprint: sprintRes.data || null,
    execution_runs: executionRuns,
    execution_checkpoints: checkpointRows,
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
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
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

  if (Object.keys(updates).length === 0) {
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
    .select('status, priority, assignee_agent_id, blocked_at, blocker_follow_up_at, blocker_followed_through_at, blocker_escalated_at')
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

  const { data: task, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', tid)
    .eq('project_id', id)
    .select()
    .single();

  if (error || !task) {
    return NextResponse.json(
      { error: 'Failed to update task', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'task.update',
    resourceType: 'task',
    resourceId: tid,
    details: { project_id: id, ...updates },
    ipAddress: getClientIp(req),
  });

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
      } else {
        activityComments.push({
          content: 'Assignee removed',
          comment_type: 'assignment',
          metadata: { old_assignee: oldTask.assignee_agent_id, new_assignee: null },
        });
      }
    }

    if (updates.priority && updates.priority !== oldTask.priority) {
      activityComments.push({
        content: `Priority changed to ${updates.priority}`,
        comment_type: 'system',
        metadata: { old_priority: oldTask.priority, new_priority: updates.priority },
      });
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

  // Deliver webhook notifications to all project members (fire-and-forget)
  getProjectMemberAgentIds(id).then(memberIds => {
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

  return NextResponse.json(refreshedTask || task);
}
