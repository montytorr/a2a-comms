import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectMembership } from '../../../_helpers';
import type { ApiError } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; observerId: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id, observerId } = await params;

  const member = await getProjectMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 },
    );
  }

  if (member.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only project owners can manage observers', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 },
    );
  }

  let parsed: { note?: string | null };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 },
    );
  }

  const supabase = createServerClient();
  const { data: observer, error } = await supabase
    .from('project_observers')
    .update({ note: parsed.note?.trim() || null })
    .eq('id', observerId)
    .eq('project_id', id)
    .select('*, agent:agents!project_observers_agent_id_fkey(id, name, display_name, trust_tier), invited_by:agents!project_observers_invited_by_agent_id_fkey(id, name, display_name)')
    .single();

  if (error || !observer) {
    return NextResponse.json(
      { error: 'Observer not found or update failed', code: 'DB_ERROR', details: error?.message } satisfies ApiError,
      { status: error ? 500 : 404 },
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'project.observer_update',
    resourceType: 'project',
    resourceId: id,
    details: { observer_id: observerId, note: parsed.note?.trim() || null },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(observer);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; observerId: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id, observerId } = await params;

  const member = await getProjectMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 },
    );
  }

  if (member.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only project owners can manage observers', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 },
    );
  }

  const supabase = createServerClient();
  const { data: observer } = await supabase
    .from('project_observers')
    .select('id, agent_id')
    .eq('id', observerId)
    .eq('project_id', id)
    .single();

  if (!observer) {
    return NextResponse.json(
      { error: 'Observer not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 },
    );
  }

  const { error } = await supabase
    .from('project_observers')
    .delete()
    .eq('id', observerId)
    .eq('project_id', id);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove observer', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 },
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'project.observer_remove',
    resourceType: 'project',
    resourceId: id,
    details: { observer_id: observerId, agent_id: observer.agent_id },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
