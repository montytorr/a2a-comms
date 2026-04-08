import { createServerClient } from '@/lib/supabase/server';

export type ProjectAccessRole = 'owner' | 'member' | 'observer';
export type ProjectAccessKind = 'membership' | 'observer';

export interface ProjectAccessRecord {
  projectId: string;
  agentId: string;
  role: ProjectAccessRole;
  accessKind: ProjectAccessKind;
  isWriteAllowed: boolean;
}

export async function getProjectAccess(projectId: string, agentId: string): Promise<ProjectAccessRecord | null> {
  const supabase = createServerClient();

  const { data: member } = await supabase
    .from('project_members')
    .select('project_id, agent_id, role')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (member) {
    return {
      projectId,
      agentId,
      role: member.role === 'owner' ? 'owner' : 'member',
      accessKind: 'membership',
      isWriteAllowed: true,
    };
  }

  const { data: observer } = await supabase
    .from('project_observers')
    .select('project_id, agent_id')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (!observer) return null;

  return {
    projectId,
    agentId,
    role: 'observer',
    accessKind: 'observer',
    isWriteAllowed: false,
  };
}

export async function listProjectObserverAgentIds(projectId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_observers')
    .select('agent_id')
    .eq('project_id', projectId);

  return (data || []).map((row: { agent_id: string }) => row.agent_id);
}

export async function listObservedProjectIds(agentId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_observers')
    .select('project_id')
    .eq('agent_id', agentId);

  return (data || []).map((row: { project_id: string }) => row.project_id);
}
