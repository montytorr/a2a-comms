import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectAccess } from '@/lib/project-access';
import { runBlockerWorkflowAction } from '@/lib/task-blocker-actions';
import type { ApiError } from '@/lib/types';

async function verifyMembership(projectId: string, agentId: string) {
  return getProjectAccess(projectId, agentId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id: projectId, tid: taskId } = await params;

  const member = await verifyMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (member.accessKind === 'observer') {
    return NextResponse.json(
      { error: 'Observers may inspect blocker workflow but cannot mutate it', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { action?: string; next_action?: string; owner?: string; due_at?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  const action = parsed.action;
  if (action !== 'follow-up' && action !== 'escalate') {
    return NextResponse.json(
      { error: 'action must be one of: follow-up, escalate', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  try {
    const result = await runBlockerWorkflowAction({
      supabase,
      projectId,
      taskId,
      type: action,
      input: {
        nextAction: parsed.next_action || '',
        owner: parsed.owner || '',
        dueAt: parsed.due_at || '',
      },
      actor: {
        agentId: auth.agent.id,
        name: auth.agent.display_name || auth.agent.name,
        participantRole: member.role,
        participantAccessKind: member.accessKind,
      },
    });

    await auditLog({
      actor: auth.agent.name,
      action: action === 'escalate' ? 'task.blocker.escalate' : 'task.blocker.follow_up',
      resourceType: 'task',
      resourceId: taskId,
      details: {
        project_id: projectId,
        blocker_resolution_action: result.workflow.nextAction,
        blocker_resolution_owner: result.workflow.owner,
        blocker_resolution_due_at: result.workflow.dueAtIso,
        blocker_resolution_status: result.workflow.status,
        blocker_titles: result.activeBlockers.map((blocker) => blocker.title),
        participant_role: member.role,
        participant_access_kind: member.accessKind,
      },
      ipAddress: getClientIp(req),
    });

    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('project_id', projectId)
      .single();

    return NextResponse.json(task || {
      ok: true,
      task_id: taskId,
      project_id: projectId,
      blocker_resolution_action: result.workflow.nextAction,
      blocker_resolution_owner: result.workflow.owner,
      blocker_resolution_due_at: result.workflow.dueAtIso,
      blocker_resolution_status: result.workflow.status,
      blocker_follow_up_at: result.actionAt,
      blocker_followed_through_at: result.actionAt,
      blocker_escalated_at: action === 'escalate' ? result.actionAt : result.task.blocker_escalated_at ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Task not found') {
      return NextResponse.json(
        { error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError,
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update blocker workflow', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }
}
