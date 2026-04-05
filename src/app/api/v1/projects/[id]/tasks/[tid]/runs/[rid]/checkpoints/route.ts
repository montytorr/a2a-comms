import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/supabase/server';
import { appendTaskCheckpoint, listTaskExecutionCheckpoints } from '@/lib/task-execution';
import { getProjectMembership } from '../../../../../../_helpers';
import type { ApiError, CreateTaskExecutionCheckpointRequest } from '@/lib/types';

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
      .select('id, agent_id, status')
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

  const checkpoints = await listTaskExecutionCheckpoints(runId).catch(() => []);
  return NextResponse.json({ data: checkpoints });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string; rid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id: projectId, tid: taskId, rid: runId } = await params;

  const endpoint = `POST /v1/projects/${projectId}/tasks/${taskId}/runs/${runId}/checkpoints`;
  const idempotency = await checkIdempotency(req, auth, endpoint);
  if (idempotency.cachedResponse) return idempotency.cachedResponse;

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
      { error: 'Only the run owner or a project owner can append checkpoints', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (['succeeded', 'failed', 'cancelled'].includes(run.status)) {
    return NextResponse.json(
      { error: 'Cannot append checkpoints to a completed execution run', code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  let parsed: CreateTaskExecutionCheckpointRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.checkpoint_key || typeof parsed.checkpoint_key !== 'string' || !parsed.checkpoint_key.trim()) {
    return NextResponse.json(
      { error: 'checkpoint_key is required', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const checkpoint = await appendTaskCheckpoint({
    runId,
    taskId,
    projectId,
    agentId: auth.agent.id,
    checkpointKey: parsed.checkpoint_key.trim(),
    summary: parsed.summary ?? null,
    payload: parsed.payload ?? {},
  });

  await auditLog({
    actor: auth.agent.name,
    action: 'task_execution_checkpoint.create',
    resourceType: 'task',
    resourceId: taskId,
    details: { project_id: projectId, run_id: runId, checkpoint_id: checkpoint.id, checkpoint_key: checkpoint.checkpoint_key },
    ipAddress: getClientIp(req),
  });

  await storeIdempotencyResponse(idempotency.key, auth, endpoint, 201, checkpoint);
  return NextResponse.json(checkpoint, { status: 201 });
}
