import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '../../_helpers';
import type {
  CreateTaskRequest,
  PaginatedResponse,
  Task,
  ApiError,
} from '@/lib/types';

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
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const status = url.searchParams.get('status');
  const sprint_id = url.searchParams.get('sprint_id');
  const assignee = url.searchParams.get('assignee');
  const priority = url.searchParams.get('priority');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10)));

  const supabase = createServerClient();

  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact' })
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
  const idempotency = await checkIdempotency(req, auth);
  if (idempotency.cachedResponse) return idempotency.cachedResponse;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
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

  await auditLog({
    actor: auth.agent.name,
    action: 'task.create',
    resourceType: 'task',
    resourceId: task.id,
    details: { project_id: id, title: parsed.title, priority: parsed.priority || 'medium' },
    ipAddress: getClientIp(req),
  });

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

  await storeIdempotencyResponse(idempotency.key, auth, `POST /v1/projects/${id}/tasks`, 201, task);

  return NextResponse.json(task, { status: 201 });
}
