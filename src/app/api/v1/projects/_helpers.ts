import { createServerClient } from '@/lib/supabase/server';
import {
  getProjectInvitationExpiry,
  isProjectInvitationExpired,
  reconcileProjectInvitationState,
} from '@/lib/project-invitations';
import type { ProjectMemberInvitation } from '@/lib/types';

export async function getProjectMembership(projectId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();
  return data;
}

/**
 * Get all agent IDs that are members of a project (for webhook delivery).
 */
export async function getProjectMemberAgentIds(projectId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_members')
    .select('agent_id')
    .eq('project_id', projectId);
  return (data || []).map((m: { agent_id: string }) => m.agent_id);
}

export async function getProjectPendingInvitation(projectId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_member_invitations')
    .select('id, status, role, invited_by_agent_id, responded_at, reminder_sent_at, expires_at, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();

  if (!data) return data;
  return normalizeProjectInvitation(data);
}

export function normalizeProjectInvitation<T extends Partial<ProjectMemberInvitation> & { created_at: string }>(invitation: T): T {
  const expires_at = invitation.expires_at || getProjectInvitationExpiry(invitation.created_at);
  if (invitation.status === 'pending' && isProjectInvitationExpired({
    status: 'pending',
    created_at: invitation.created_at,
    expires_at,
  })) {
    return { ...invitation, status: 'expired', expires_at } as T;
  }
  return { ...invitation, expires_at } as T;
}

export async function hydrateProjectInvitations<T extends Partial<ProjectMemberInvitation> & { created_at: string }>(invitations: T[]): Promise<T[]> {
  const normalized = invitations.map((invitation) => normalizeProjectInvitation(invitation));
  const reconciled = await Promise.all(normalized.map((invitation) => reconcileProjectInvitationState(invitation as never)));
  return reconciled as unknown as T[];
}
