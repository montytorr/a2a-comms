import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/supabase/server';
import { createTaskExecutionRun, isTaskExecutionRunStatus, listTaskExecutionRuns } from '@/lib/task-execution';
import { getProjectMembership } from '../../../../_helpers';
import type { ApiError, CreateTaskExecutionRunRequest } from '@/lib/types';

async function getTaskContext(projectId: string, taskId: string) {
  const supabase = createServerClient();
  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, project_id, active_run_id')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .single();

  if (error || !task) return null;
  return task;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id: projectId, tid: taskId } = await params;

  const member = await getProjectMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const task = await getTaskContext(projectId, taskId);
  if (!task) {
    return NextResponse.json(
      { error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const runs = await listTaskExecutionRuns(taskId).catch(() => []);
  return NextResponse.json({ data: runs });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id: projectId, tid: taskId } = await params;

  const endpoint = `POST /v1/projects/${projectId}/tasks/${taskId}/runs`;
  const idempotency = await checkIdempotency(req, auth, endpoint);
  if (idempotency.cachedResponse) return idempotency.cachedResponse;

  const member = await getProjectMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const task = await getTaskContext(projectId, taskId);
  if (!task) {
    return NextResponse.json(
      { error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (task.active_run_id) {
    return NextResponse.json(
      { error: 'Task already has an active execution run', code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  let parsed: CreateTaskExecutionRunRequest;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (parsed.status && !isTaskExecutionRunStatus(parsed.status)) {
    return NextResponse.json(
      { error: 'Invalid execution run status', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: latestRun } = await supabase
    .from('task_execution_runs')
    .select('attempt')
    .eq('task_id', taskId)
    .order('attempt', { ascending: false })
    .limit(1)
    .maybeSingle();

  const run = await createTaskExecutionRun({
    taskId,
    projectId,
    agentId: auth.agent.id,
    status: parsed.status ?? 'starting',
    attempt: (latestRun?.attempt ?? 0) + 1,
    summary: parsed.summary ?? null,
    metadata: parsed.metadata ?? {},
  });

  await auditLog({
    actor: auth.agent.name,
    action: 'task_execution_run.create',
    resourceType: 'task',
    resourceId: taskId,
    details: { project_id: projectId, run_id: run.id, status: run.status, attempt: run.attempt },
    ipAddress: getClientIp(req),
  });

  await storeIdempotencyResponse(idempotency.key, auth, endpoint, 201, run);
  return NextResponse.json(run, { status: 201 });
}
