import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError } from '@/lib/types';

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

async function verifyTaskInProject(taskId: string, projectId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .single();
  return !!data;
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

  const taskInProject = await verifyTaskInProject(tid, id);
  if (!taskInProject) {
    return NextResponse.json(
      { error: 'Task not found in this project', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const supabase = createServerClient();

  const [blockedByRes, blocksRes] = await Promise.all([
    supabase
      .from('task_dependencies')
      .select('*, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status, project_id)')
      .eq('blocked_task_id', tid),
    supabase
      .from('task_dependencies')
      .select('*, blocked_task:tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id)')
      .eq('blocking_task_id', tid),
  ]);

  type TaskDependencyWithJoin = {
    blocking_task?: { project_id: string } | null;
    blocked_task?: { project_id: string } | null;
  };

  // Filter to only deps where the joined task belongs to this project
  const filteredBlockedBy = ((blockedByRes.data || []) as TaskDependencyWithJoin[]).filter(
    (dep) => dep.blocking_task?.project_id === id
  );
  const filteredBlocks = ((blocksRes.data || []) as TaskDependencyWithJoin[]).filter(
    (dep) => dep.blocked_task?.project_id === id
  );

  return NextResponse.json({
    blocked_by: filteredBlockedBy,
    blocks: filteredBlocks,
  });
}

export async function POST(
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

  let parsed: { blocking_task_id?: string; blocked_task_id?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Determine relationship: either this task blocks another, or is blocked by another
  let blockingId: string;
  let blockedId: string;

  if (parsed.blocking_task_id) {
    // This task is blocked by blocking_task_id
    blockingId = parsed.blocking_task_id;
    blockedId = tid;
  } else if (parsed.blocked_task_id) {
    // This task blocks blocked_task_id
    blockingId = tid;
    blockedId = parsed.blocked_task_id;
  } else {
    return NextResponse.json(
      { error: 'Must provide blocking_task_id or blocked_task_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (blockingId === blockedId) {
    return NextResponse.json(
      { error: 'A task cannot depend on itself', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const [taskValid, otherTaskValid] = await Promise.all([
    verifyTaskInProject(tid, id),
    verifyTaskInProject(parsed.blocking_task_id || parsed.blocked_task_id!, id),
  ]);
  if (!taskValid || !otherTaskValid) {
    return NextResponse.json(
      { error: 'Both tasks must belong to this project', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const supabase = createServerClient();

  const { data: dep, error } = await supabase
    .from('task_dependencies')
    .insert({
      blocking_task_id: blockingId,
      blocked_task_id: blockedId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This dependency already exists', code: 'DUPLICATE' } satisfies ApiError,
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create dependency', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'task.dependency_add',
    resourceType: 'task',
    resourceId: tid,
    details: { blocking_task_id: blockingId, blocked_task_id: blockedId },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(dep, { status: 201 });
}

export async function DELETE(
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

  let parsed: { dependency_id: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.dependency_id) {
    return NextResponse.json(
      { error: 'Missing required field: dependency_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify the task belongs to this project
  const taskInProject = await verifyTaskInProject(tid, id);
  if (!taskInProject) {
    return NextResponse.json(
      { error: 'Task not found in this project', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  // Verify the dependency exists and both tasks belong to this project
  const { data: dep } = await supabase
    .from('task_dependencies')
    .select('blocking_task_id, blocked_task_id')
    .eq('id', parsed.dependency_id)
    .single();

  if (!dep) {
    return NextResponse.json(
      { error: 'Dependency not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const [blockingInProject, blockedInProject] = await Promise.all([
    verifyTaskInProject(dep.blocking_task_id, id),
    verifyTaskInProject(dep.blocked_task_id, id),
  ]);
  if (!blockingInProject || !blockedInProject) {
    return NextResponse.json(
      { error: 'Dependency does not belong to this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('task_dependencies')
    .delete()
    .eq('id', parsed.dependency_id);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove dependency', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'task.dependency_remove',
    resourceType: 'task',
    resourceId: tid,
    details: { dependency_id: parsed.dependency_id },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}
