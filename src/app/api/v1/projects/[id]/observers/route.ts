import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectMembership } from '../../_helpers';
import type { ApiError } from '@/lib/types';
import { evaluateObserverAccess } from '@/lib/trust-tiers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  const member = await getProjectMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a participant in this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 },
    );
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('project_observers')
    .select('*, agent:agents!project_observers_agent_id_fkey(id, name, display_name, trust_tier), invited_by:agents!project_observers_invited_by_agent_id_fkey(id, name, display_name)')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch observers', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  const member = await getProjectMembership(id, auth.agent.id);
  if (!member || member.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only project owners can manage observers', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 },
    );
  }

  let parsed: { agent_id?: string; note?: string | null };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 },
    );
  }

  if (!parsed.agent_id) {
    return NextResponse.json(
      { error: 'Missing required field: agent_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 },
    );
  }

  const supabase = createServerClient();
  const [{ data: project }, { data: agent }, { data: existingMember }, { data: existingObserver }] = await Promise.all([
    supabase.from('projects').select('id, title').eq('id', id).single(),
    supabase.from('agents').select('id, name, display_name, owner_user_id, trust_tier').eq('id', parsed.agent_id).single(),
    supabase.from('project_members').select('id').eq('project_id', id).eq('agent_id', parsed.agent_id).single(),
    supabase.from('project_observers').select('id').eq('project_id', id).eq('agent_id', parsed.agent_id).single(),
  ]);

  if (!project) {
    return NextResponse.json(
      { error: 'Project not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 },
    );
  }

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 },
    );
  }

  if (parsed.agent_id === auth.agent.id) {
    return NextResponse.json(
      { error: 'Project owner is already covered by membership', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 },
    );
  }

  const trustGate = evaluateObserverAccess(auth.agent, agent);
  if (!trustGate.allowed) {
    return NextResponse.json(
      { error: trustGate.reason || 'Target agent is not trusted enough for observer access', code: 'TRUST_TIER_BLOCKED' } satisfies ApiError,
      { status: 403 },
    );
  }

  if (existingMember) {
    return NextResponse.json(
      { error: 'Agent is already a project member', code: 'DUPLICATE' } satisfies ApiError,
      { status: 409 },
    );
  }

  if (existingObserver) {
    return NextResponse.json(
      { error: 'Agent is already an observer on this project', code: 'DUPLICATE' } satisfies ApiError,
      { status: 409 },
    );
  }

  const { data: observer, error } = await supabase
    .from('project_observers')
    .insert({
      project_id: id,
      agent_id: parsed.agent_id,
      invited_by_agent_id: auth.agent.id,
      note: parsed.note?.trim() || null,
    })
    .select('*, agent:agents!project_observers_agent_id_fkey(id, name, display_name, trust_tier), invited_by:agents!project_observers_invited_by_agent_id_fkey(id, name, display_name)')
    .single();

  if (error || !observer) {
    return NextResponse.json(
      { error: 'Failed to add observer', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 },
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'project.observer_add',
    resourceType: 'project',
    resourceId: id,
    details: { project_title: project.title, agent_id: parsed.agent_id, note: parsed.note?.trim() || null },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(observer, { status: 201 });
}
