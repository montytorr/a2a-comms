import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { UpdateTaskRequest, ApiError } from '@/lib/types';

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
  const [depsBlockingRes, depsBlockedRes, contractsRes, assigneeRes, reporterRes, sprintRes] = await Promise.all([
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

  return NextResponse.json(task);
}
