import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '../../_helpers';
import type { CreateSprintRequest, ApiError } from '@/lib/types';
import { getProjectAccess } from '@/lib/project-access';

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

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();
  const { data: sprints, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('project_id', id)
    .order('position', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch sprints', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({ data: sprints || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (member.accessKind === 'observer') {
    return NextResponse.json(
      { error: 'Observers may inspect sprints but cannot create them', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: CreateSprintRequest;
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

  const supabase = createServerClient();

  // Get next position via count (more robust than max+1 under concurrent inserts)
  const { count } = await supabase
    .from('sprints')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id);

  const nextPosition = count ?? 0;

  const { data: sprint, error } = await supabase
    .from('sprints')
    .insert({
      project_id: id,
      title: parsed.title,
      goal: parsed.goal || null,
      start_date: parsed.start_date || null,
      end_date: parsed.end_date || null,
      position: nextPosition,
    })
    .select()
    .single();

  if (error || !sprint) {
    return NextResponse.json(
      { error: 'Failed to create sprint', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'sprint.create',
    resourceType: 'sprint',
    resourceId: sprint.id,
    details: { project_id: id, title: parsed.title },
    ipAddress: getClientIp(req),
  });

  // Deliver webhook notifications to all project members (fire-and-forget)
  getProjectMemberAgentIds(id).then(memberIds => {
    deliverWebhooks(memberIds, {
      event: 'sprint.created',
      project_id: id,
      sprint_id: sprint.id,
      data: { title: parsed.title, created_by: auth.agent.name },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }).catch(() => {});

  return NextResponse.json(sprint, { status: 201 });
}
