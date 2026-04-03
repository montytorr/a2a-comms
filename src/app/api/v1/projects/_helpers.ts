import { createServerClient } from '@/lib/supabase/server';

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
    .select('id, status, role, invited_by_agent_id, responded_at, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();
  return data;
}
