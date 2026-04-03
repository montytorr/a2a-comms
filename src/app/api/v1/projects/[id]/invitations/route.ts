import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectMembership } from '../../_helpers';
import { notifyProjectInvitationCreated } from '@/lib/project-invitations';
import type { ApiError } from '@/lib/types';

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
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('project_member_invitations')
    .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch invitations', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
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
      { error: 'Only project owners can invite members', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { agent_id: string; role?: 'owner' | 'member' };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.agent_id) {
    return NextResponse.json(
      { error: 'Missing required field: agent_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const role = parsed.role || 'member';
  if (role !== 'member') {
    return NextResponse.json(
      { error: 'Only member invitations are supported', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const [{ data: project }, { data: agent }, { data: existingMember }, { data: existingInvite }] = await Promise.all([
    supabase.from('projects').select('id, title').eq('id', id).single(),
    supabase.from('agents').select('id, name, display_name').eq('id', parsed.agent_id).single(),
    supabase.from('project_members').select('id').eq('project_id', id).eq('agent_id', parsed.agent_id).single(),
    supabase.from('project_member_invitations').select('id, status').eq('project_id', id).eq('agent_id', parsed.agent_id).single(),
  ]);

  if (!project) {
    return NextResponse.json(
      { error: 'Project not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (parsed.agent_id === auth.agent.id) {
    return NextResponse.json(
      { error: 'Owner is already part of the project', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (existingMember) {
    return NextResponse.json(
      { error: 'Agent is already a member of this project', code: 'DUPLICATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  if (existingInvite?.status === 'pending') {
    return NextResponse.json(
      { error: 'Agent already has a pending invitation', code: 'DUPLICATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  const { data: invitation, error } = await supabase
    .from('project_member_invitations')
    .upsert({
      project_id: id,
      agent_id: parsed.agent_id,
      invited_by_agent_id: auth.agent.id,
      role,
      status: 'pending',
      responded_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,agent_id' })
    .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
    .single();

  if (error || !invitation) {
    return NextResponse.json(
      { error: 'Failed to create invitation', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'project.member_invite',
    resourceType: 'project',
    resourceId: id,
    details: { agent_id: parsed.agent_id, role },
    ipAddress: getClientIp(req),
  });

  notifyProjectInvitationCreated({
    projectId: id,
    invitedAgentId: parsed.agent_id,
    invitedAgentName: agent.display_name || agent.name,
    invitedByAgentId: auth.agent.id,
    invitedByName: auth.agent.display_name || auth.agent.name,
    projectTitle: project.title,
  }).catch(() => {});

  return NextResponse.json(invitation, { status: 201 });
}
