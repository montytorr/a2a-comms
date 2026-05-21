import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '../../../_helpers';
import type { UpdateSprintRequest, ApiError } from '@/lib/types';
import { getProjectAccess } from '@/lib/project-access';

async function verifyMembership(projectId: string, agentId: string) {
  return getProjectAccess(projectId, agentId);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id, sid } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();
  const { data: sprint, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', sid)
    .eq('project_id', id)
    .single();

  if (error || !sprint) {
    return NextResponse.json(
      { error: 'Sprint not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  // Get task stats for this sprint
  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('sprint_id', sid);

  if (taskError) {
    return NextResponse.json(
      { error: 'Failed to fetch task stats', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  const taskList = tasks || [];

  return NextResponse.json({
    ...sprint,
    task_stats: {
      total: taskList.length,
      done: taskList.filter(t => t.status === 'done').length,
      in_progress: taskList.filter(t => t.status === 'in-progress').length,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id, sid } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (member.accessKind === 'observer') {
    return NextResponse.json(
      { error: 'Observers may inspect sprints but cannot update them', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: UpdateSprintRequest;
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
  if (parsed.goal !== undefined) updates.goal = parsed.goal;
  if (parsed.status !== undefined) {
    const validStatuses = ['planned', 'active', 'completed'];
    if (!validStatuses.includes(parsed.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
    updates.status = parsed.status;
  }
  if (parsed.start_date !== undefined) updates.start_date = parsed.start_date;
  if (parsed.end_date !== undefined) updates.end_date = parsed.end_date;
  const positionChange = parsed.position !== undefined ? parsed.position : undefined;
  if (positionChange !== undefined) updates.position = positionChange;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No fields to update', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // If position is being changed, shift siblings to avoid duplicate positions
  if (positionChange !== undefined) {
    const { data: current } = await supabase
      .from('sprints')
      .select('position')
      .eq('id', sid)
      .eq('project_id', id)
      .single();

    if (current && current.position !== positionChange) {
      const oldPos = current.position;
      const newPos = positionChange;
      const shiftResult = newPos < oldPos
        ? await supabase.rpc('shift_sprint_positions', { p_project_id: id, p_min: newPos, p_max: oldPos - 1, p_delta: 1 })
        : await supabase.rpc('shift_sprint_positions', { p_project_id: id, p_min: oldPos + 1, p_max: newPos, p_delta: -1 });

      if (shiftResult.error) {
        return NextResponse.json(
          { error: 'Failed to reorder sprint positions', code: 'REORDER_ERROR' } satisfies ApiError,
          { status: 500 }
        );
      }
    }
  }

  const { data: sprint, error } = await supabase
    .from('sprints')
    .update(updates)
    .eq('id', sid)
    .eq('project_id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update sprint', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  if (!sprint) {
    return NextResponse.json(
      { error: 'Sprint not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'sprint.update',
    resourceType: 'sprint',
    resourceId: sid,
    details: { project_id: id, ...updates },
    ipAddress: getClientIp(req),
  });

  // Deliver webhook notifications to all project members (fire-and-forget)
  getProjectMemberAgentIds(id).then(memberIds => {
    deliverWebhooks(memberIds, {
      event: 'sprint.updated',
      project_id: id,
      sprint_id: sid,
      data: { title: sprint.title, updated_by: auth.agent.name, changes: updates },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }).catch(() => {});

  return NextResponse.json(sprint);
}
