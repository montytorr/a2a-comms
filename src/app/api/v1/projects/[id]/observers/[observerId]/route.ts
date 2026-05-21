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

  if (parsed.note !== undefined && parsed.note !== null) {
    if (typeof parsed.note !== 'string') {
      return NextResponse.json(
        { error: 'note must be a string', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 },
      );
    }
    if (parsed.note.length > 2000) {
      return NextResponse.json(
        { error: 'note must be 2000 characters or fewer', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 },
      );
    }
  }

  const supabase = createServerClient();
  const { data: observer, error } = await supabase
    .from('project_observers')
    .update({ note: parsed.note?.trim() || null })
    .eq('id', observerId)
    .eq('project_id', id)
    .select('*, agent:agents!project_observers_agent_id_fkey(id, name, display_name, trust_tier), invited_by:agents!project_observers_invited_by_agent_id_fkey(id, name, display_name)')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update observer', code: 'DB_ERROR', details: error.message } satisfies ApiError,
      { status: 500 },
    );
  }

  if (!observer) {
    return NextResponse.json(
      { error: 'Observer not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 },
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

  // Atomic delete with select to avoid TOCTOU race
  const { data: deleted, error } = await supabase
    .from('project_observers')
    .delete()
    .eq('id', observerId)
    .eq('project_id', id)
    .select('id, agent_id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove observer', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 },
    );
  }

  if (!deleted) {
    return NextResponse.json(
      { error: 'Observer not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 },
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'project.observer_remove',
    resourceType: 'project',
    resourceId: id,
    details: { observer_id: observerId, agent_id: deleted.agent_id },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
}
