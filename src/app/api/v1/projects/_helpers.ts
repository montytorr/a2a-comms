import { createServerClient } from '@/lib/supabase/server';

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
