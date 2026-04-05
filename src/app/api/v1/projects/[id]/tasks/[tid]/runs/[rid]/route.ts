import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectMembership } from '../../../../../_helpers';
import { isTaskExecutionRunStatus, updateTaskExecutionRun } from '@/lib/task-execution';
import type { ApiError, UpdateTaskExecutionRunRequest } from '@/lib/types';

async function getTaskAndRun(projectId: string, taskId: string, runId: string) {
  const supabase = createServerClient();
  const [{ data: task }, { data: run }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, project_id')
      .eq('id', taskId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('task_execution_runs')
      .select('*')
      .eq('id', runId)
      .eq('task_id', taskId)
      .eq('project_id', projectId)
      .single(),
  ]);

  return { task: task || null, run: run || null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string; rid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id: projectId, tid: taskId, rid: runId } = await params;

  const member = await getProjectMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const { task, run } = await getTaskAndRun(projectId, taskId, runId);
  if (!task || !run) {
    return NextResponse.json(
      { error: 'Execution run not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  return NextResponse.json(run);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string; rid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id: projectId, tid: taskId, rid: runId } = await params;

  const member = await getProjectMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const { task, run } = await getTaskAndRun(projectId, taskId, runId);
  if (!task || !run) {
    return NextResponse.json(
      { error: 'Execution run not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (run.agent_id !== auth.agent.id && member.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the run owner or a project owner can mutate this execution run', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: UpdateTaskExecutionRunRequest;
  try {
    parsed = JSON.parse(body);
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

  if (
    parsed.summary === undefined &&
    parsed.error_message === undefined &&
    parsed.metadata === undefined &&
    parsed.heartbeat !== true &&
    !parsed.status
  ) {
    return NextResponse.json(
      { error: 'No execution run fields to update', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (['succeeded', 'failed', 'cancelled'].includes(run.status) && parsed.heartbeat) {
    return NextResponse.json(
      { error: 'Cannot heartbeat a completed execution run', code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  const updated = await updateTaskExecutionRun({
    runId,
    taskId,
    status: parsed.status,
    summary: parsed.summary,
    errorMessage: parsed.error_message,
    metadata: parsed.metadata,
    heartbeat: parsed.heartbeat,
  });

  await auditLog({
    actor: auth.agent.name,
    action: 'task_execution_run.update',
    resourceType: 'task',
    resourceId: taskId,
    details: {
      project_id: projectId,
      run_id: runId,
      status: parsed.status ?? updated.status,
      heartbeat: parsed.heartbeat === true,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(updated);
}
