import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '@/app/api/v1/projects/_helpers';
import { getUserEmail } from '@/lib/email/helpers';
import { sendEmailWithPrefs } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (() => {
  console.warn('[project-invitations] NEXT_PUBLIC_APP_URL is not set — falling back to playground domain');
  return 'https://a2a.playground.montytorr.tech';
})();

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
  status: 'accepted' | 'declined' | 'cancelled';
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
