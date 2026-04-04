import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectMembership, normalizeProjectInvitation } from '../../../_helpers';
import { notifyProjectInvitationResponded } from '@/lib/project-invitations';
import type { ApiError } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id, invitationId } = await params;

  let parsed: { action: 'accept' | 'decline' | 'cancel' };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.action || !['accept', 'decline', 'cancel'].includes(parsed.action)) {
    return NextResponse.json(
      { error: 'Action must be one of: accept, decline, cancel', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: rawInvitation } = await supabase
    .from('project_member_invitations')
    .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name), project:projects(id, title)')
    .eq('id', invitationId)
    .eq('project_id', id)
    .single();

  const invitation = rawInvitation ? normalizeProjectInvitation(rawInvitation) : null;

  if (!invitation) {
    return NextResponse.json(
      { error: 'Invitation not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (invitation.status !== 'pending') {
    const errorMessage = invitation.status === 'expired'
      ? 'Invitation has expired'
      : 'Invitation has already been resolved';
    return NextResponse.json(
      { error: errorMessage, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 409 }
    );
  }

  const callerMembership = await getProjectMembership(id, auth.agent.id);
  const isInvitee = invitation.agent_id === auth.agent.id;
  const isOwner = !!callerMembership && callerMembership.role === 'owner';

  if (parsed.action === 'cancel') {
    if (!isOwner && auth.agent.id !== invitation.invited_by_agent_id) {
      return NextResponse.json(
        { error: 'Only project owners can cancel invitations', code: 'FORBIDDEN' } satisfies ApiError,
        { status: 403 }
      );
    }
  } else if (!isInvitee) {
    return NextResponse.json(
      { error: 'Only the invited agent can respond to this invitation', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const nextStatus = parsed.action === 'accept'
    ? 'accepted'
    : parsed.action === 'decline'
      ? 'declined'
      : 'cancelled';

  const respondedAt = new Date().toISOString();
  const { data: updatedInvitation, error } = await supabase
    .from('project_member_invitations')
    .update({ status: nextStatus, responded_at: respondedAt, updated_at: respondedAt })
    .eq('id', invitationId)
    .eq('project_id', id)
    .eq('status', 'pending')
    .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
    .single();

  if (error || !updatedInvitation) {
    return NextResponse.json(
      { error: 'Failed to update invitation', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  if (nextStatus === 'accepted') {
    const { error: addMemberError } = await supabase
      .from('project_members')
      .insert({
        project_id: id,
        agent_id: invitation.agent_id,
        role: invitation.role,
      });

    if (addMemberError && addMemberError.code !== '23505') {
      await supabase
        .from('project_member_invitations')
        .update({ status: 'pending', responded_at: null, updated_at: new Date().toISOString() })
        .eq('id', invitationId);

      return NextResponse.json(
        { error: 'Failed to add invited agent to project', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }
  }

  await auditLog({
    actor: auth.agent.name,
    action: `project.member_invitation.${parsed.action}`,
    resourceType: 'project',
    resourceId: id,
    details: { invitation_id: invitationId, agent_id: invitation.agent_id },
    ipAddress: getClientIp(req),
  });

  if (nextStatus === 'accepted') {
    await auditLog({
      actor: auth.agent.name,
      action: 'project.member_add',
      resourceType: 'project',
      resourceId: id,
      details: { agent_id: invitation.agent_id, role: invitation.role, via: 'invitation' },
      ipAddress: getClientIp(req),
    });
  }

  notifyProjectInvitationResponded({
    projectId: id,
    projectTitle: invitation.project?.title || 'Unknown Project',
    invitedAgentId: invitation.agent_id,
    invitedAgentName: invitation.agent?.display_name || invitation.agent?.name || 'Unknown Agent',
    invitedByAgentId: invitation.invited_by_agent_id,
    invitedByName: invitation.invited_by?.display_name || invitation.invited_by?.name || 'Unknown Agent',
    status: nextStatus,
  }).catch(() => {});

  return NextResponse.json(updatedInvitation);
}
