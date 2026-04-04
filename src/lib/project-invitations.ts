import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '@/app/api/v1/projects/_helpers';
import { getUserEmail } from '@/lib/email/helpers';
import { sendEmailWithPrefs } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (() => {
  console.warn('[project-invitations] NEXT_PUBLIC_APP_URL is not set — falling back to playground domain');
  return 'https://a2a.playground.montytorr.tech';
})();

export const PROJECT_INVITATION_TTL_DAYS = 7;
export const PROJECT_INVITATION_REMINDER_HOURS = 72;

type ProjectInvitationRow = {
  id: string;
  project_id: string;
  agent_id: string;
  invited_by_agent_id: string;
  role: 'owner' | 'member';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  reminder_sent_at?: string | null;
  expires_at?: string | null;
  responded_at?: string | null;
  created_at: string;
  updated_at?: string;
  agent?: { id: string; name: string; display_name: string } | null;
  invited_by?: { id: string; name: string; display_name: string } | null;
  project?: { id: string; title: string } | null;
};

export function getProjectInvitationExpiry(createdAt: string | Date): string {
  const expiresAt = new Date(createdAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + PROJECT_INVITATION_TTL_DAYS);
  return expiresAt.toISOString();
}

export function getProjectInvitationReminderThreshold(createdAt: string | Date): string {
  const threshold = new Date(createdAt);
  threshold.setUTCHours(threshold.getUTCHours() + PROJECT_INVITATION_REMINDER_HOURS);
  return threshold.toISOString();
}

export function isProjectInvitationExpired(invitation: Pick<ProjectInvitationRow, 'status' | 'expires_at' | 'created_at'>): boolean {
  if (invitation.status !== 'pending') return false;
  const expiresAt = invitation.expires_at || getProjectInvitationExpiry(invitation.created_at);
  return new Date(expiresAt).getTime() <= Date.now();
}

export function isProjectInvitationReminderDue(
  invitation: Pick<ProjectInvitationRow, 'status' | 'created_at' | 'reminder_sent_at' | 'expires_at'>,
  now = new Date()
): boolean {
  if (invitation.status !== 'pending') return false;
  if (invitation.reminder_sent_at) return false;
  if (isProjectInvitationExpired(invitation)) return false;
  const threshold = getProjectInvitationReminderThreshold(invitation.created_at);
  return new Date(threshold).getTime() <= now.getTime();
}

export async function sendProjectMemberInvitationEmail(options: {
  to: string;
  userId?: string;
  projectTitle: string;
  inviterName: string;
  projectId: string;
}): Promise<void> {
  const props = {
    projectTitle: options.projectTitle,
    inviterName: options.inviterName,
    invitationUrl: `${APP_URL}/projects/${options.projectId}`,
  };

  if (options.userId) {
    await sendEmailWithPrefs(options.to, options.userId, 'project-member-invitation', props);
    return;
  }

  // Fallback path if we somehow don't have a user id.
  await sendEmailWithPrefs(options.to, '00000000-0000-0000-0000-000000000000', 'project-member-invitation', props);
}

export async function notifyProjectInvitationCreated(options: {
  projectId: string;
  invitedAgentId: string;
  invitedAgentName: string;
  invitedByAgentId: string;
  invitedByName: string;
  projectTitle: string;
}): Promise<void> {
  const supabase = createServerClient();

  // Notify existing members + invited agent via webhooks.
  const memberIds = await getProjectMemberAgentIds(options.projectId);
  const targets = Array.from(new Set([...memberIds, options.invitedAgentId]));

  await deliverWebhooks(targets, {
    event: 'project.member_invited',
    project_id: options.projectId,
    data: {
      agent_id: options.invitedAgentId,
      agent_name: options.invitedAgentName,
      invited_by: options.invitedByName,
      invited_by_agent_id: options.invitedByAgentId,
      project_title: options.projectTitle,
    },
    timestamp: new Date().toISOString(),
  });

  const { data: invitedAgent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', options.invitedAgentId)
    .single();

  if (!invitedAgent?.owner_user_id) return;

  const email = await getUserEmail(invitedAgent.owner_user_id);
  if (!email) return;

  await sendProjectMemberInvitationEmail({
    to: email,
    userId: invitedAgent.owner_user_id,
    projectTitle: options.projectTitle,
    inviterName: options.invitedByName,
    projectId: options.projectId,
  });
}

export async function notifyProjectInvitationResponded(options: {
  projectId: string;
  projectTitle: string;
  invitedAgentId: string;
  invitedAgentName: string;
  invitedByAgentId: string;
  invitedByName: string;
  status: 'accepted' | 'declined' | 'cancelled' | 'expired';
}): Promise<void> {
  const memberIds = await getProjectMemberAgentIds(options.projectId);
  const targets = Array.from(new Set([...memberIds, options.invitedByAgentId, options.invitedAgentId]));

  await deliverWebhooks(targets, {
    event: `project.member_${options.status}`,
    project_id: options.projectId,
    data: {
      agent_id: options.invitedAgentId,
      agent_name: options.invitedAgentName,
      invited_by: options.invitedByName,
      invited_by_agent_id: options.invitedByAgentId,
      project_title: options.projectTitle,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function notifyProjectInvitationReminder(options: {
  projectId: string;
  projectTitle: string;
  invitedAgentId: string;
  invitedAgentName: string;
  invitedByAgentId: string;
  invitedByName: string;
  invitationId: string;
  expiresAt: string;
}): Promise<void> {
  const memberIds = await getProjectMemberAgentIds(options.projectId);
  const targets = Array.from(new Set([...memberIds, options.invitedByAgentId, options.invitedAgentId]));

  await deliverWebhooks(targets, {
    event: 'project.member_invited',
    project_id: options.projectId,
    data: {
      agent_id: options.invitedAgentId,
      agent_name: options.invitedAgentName,
      invited_by: options.invitedByName,
      invited_by_agent_id: options.invitedByAgentId,
      project_title: options.projectTitle,
      invitation_id: options.invitationId,
      reminder: true,
      expires_at: options.expiresAt,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function expireProjectInvitationIfNeeded(invitation: ProjectInvitationRow): Promise<ProjectInvitationRow> {
  if (!isProjectInvitationExpired(invitation)) return invitation;

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data: updatedInvitation, error } = await supabase
    .from('project_member_invitations')
    .update({
      status: 'expired',
      responded_at: now,
      updated_at: now,
    })
    .eq('id', invitation.id)
    .eq('status', 'pending')
    .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name), project:projects(id, title)')
    .single();

  if (error || !updatedInvitation) return { ...invitation, status: 'expired', responded_at: now, updated_at: now };

  await notifyProjectInvitationResponded({
    projectId: updatedInvitation.project_id,
    projectTitle: updatedInvitation.project?.title || 'Unknown Project',
    invitedAgentId: updatedInvitation.agent_id,
    invitedAgentName: updatedInvitation.agent?.display_name || updatedInvitation.agent?.name || 'Unknown Agent',
    invitedByAgentId: updatedInvitation.invited_by_agent_id,
    invitedByName: updatedInvitation.invited_by?.display_name || updatedInvitation.invited_by?.name || 'Unknown Agent',
    status: 'expired',
  }).catch(() => {});

  return updatedInvitation;
}

export async function sendProjectInvitationReminderIfDue(invitation: ProjectInvitationRow): Promise<ProjectInvitationRow> {
  if (!isProjectInvitationReminderDue(invitation)) return invitation;

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const expiresAt = invitation.expires_at || getProjectInvitationExpiry(invitation.created_at);

  const { data: updatedInvitation, error } = await supabase
    .from('project_member_invitations')
    .update({ reminder_sent_at: now, updated_at: now })
    .eq('id', invitation.id)
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name), project:projects(id, title)')
    .single();

  if (error || !updatedInvitation) return invitation;

  await notifyProjectInvitationReminder({
    projectId: updatedInvitation.project_id,
    projectTitle: updatedInvitation.project?.title || 'Unknown Project',
    invitedAgentId: updatedInvitation.agent_id,
    invitedAgentName: updatedInvitation.agent?.display_name || updatedInvitation.agent?.name || 'Unknown Agent',
    invitedByAgentId: updatedInvitation.invited_by_agent_id,
    invitedByName: updatedInvitation.invited_by?.display_name || updatedInvitation.invited_by?.name || 'Unknown Agent',
    invitationId: updatedInvitation.id,
    expiresAt,
  }).catch(() => {});

  const { data: invitedAgent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', updatedInvitation.agent_id)
    .single();

  if (invitedAgent?.owner_user_id) {
    const email = await getUserEmail(invitedAgent.owner_user_id);
    if (email) {
      await sendProjectMemberInvitationEmail({
        to: email,
        userId: invitedAgent.owner_user_id,
        projectTitle: updatedInvitation.project?.title || 'Unknown Project',
        inviterName: updatedInvitation.invited_by?.display_name || updatedInvitation.invited_by?.name || 'Unknown Agent',
        projectId: updatedInvitation.project_id,
      }).catch(() => {});
    }
  }

  return updatedInvitation;
}

export async function reconcileProjectInvitationState(invitation: ProjectInvitationRow): Promise<ProjectInvitationRow> {
  const expired = await expireProjectInvitationIfNeeded(invitation);
  if (expired.status !== 'pending') return expired;
  return sendProjectInvitationReminderIfDue(expired);
}
