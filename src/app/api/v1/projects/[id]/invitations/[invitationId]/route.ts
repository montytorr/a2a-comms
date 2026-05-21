import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectMembership, normalizeProjectInvitation } from '../../../_helpers';
import { isProjectInvitationExpired, notifyProjectInvitationResponded } from '@/lib/project-invitations';
import { evaluateProjectMemberInvite } from '@/lib/trust-tiers';
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
    .select('*, agent:agents!project_member_invitations_agent_id_fkey(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name), project:projects(id, title)')
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

  // Check expiry inline — don't rely solely on the sweep job
  if (isProjectInvitationExpired({
    status: invitation.status,
    created_at: invitation.created_at,
    expires_at: invitation.expires_at,
  })) {
    return NextResponse.json(
      { error: 'Invitation has expired', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 409 }
    );
  }

  const callerMembership = await getProjectMembership(id, auth.agent.id);
  const isInvitee = invitation.agent_id === auth.agent.id;
  const isOwner = !!callerMembership && callerMembership.role === 'owner';

  // Trust-tier policy check on accept: re-evaluate at acceptance time
  // The inviter is the caller, the invitee is the target
  if (parsed.action === 'accept') {
    const { data: inviterAgent } = await supabase
      .from('agents')
      .select('id, name, owner_user_id, trust_tier')
      .eq('id', invitation.invited_by_agent_id)
      .single();

    const { data: inviteeAgent } = await supabase
      .from('agents')
      .select('id, name, owner_user_id, trust_tier')
      .eq('id', invitation.agent_id)
      .single();

    if (inviterAgent && inviteeAgent) {
      const trustGate = evaluateProjectMemberInvite(inviterAgent, inviteeAgent);
      if (!trustGate.allowed) {
        return NextResponse.json(
          { error: trustGate.reason || 'Trust policy blocks this agent from joining the project', code: 'TRUST_TIER_BLOCKED' } satisfies ApiError,
          { status: 403 }
        );
      }
    }
  }

  if (parsed.action === 'cancel') {
    if (!isOwner && auth.agent.id !== invitation.invited_by_agent_id) {
      return NextResponse.json(
        { error: 'Only project owners or the original inviter can cancel invitations', code: 'FORBIDDEN' } satisfies ApiError,
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
    .select('*, agent:agents!project_member_invitations_agent_id_fkey(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update invitation', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  if (!updatedInvitation) {
    return NextResponse.json(
      { error: 'Invitation was already resolved by another request', code: 'CONFLICT' } satisfies ApiError,
      { status: 409 }
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
