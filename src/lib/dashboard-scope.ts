import type { AuthActorContext } from '@/lib/auth-actor-context';
import { createServerClient } from '@/lib/supabase/server';

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

export type DashboardVisibilityScope = {
  agentIds: string[];
  contractIds: string[];
  contractParticipantAgentIds: string[];
  contractActorNames: string[];
  projectIds: string[];
  webhookIds: string[];
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

export async function buildDashboardVisibilityScope(auth: AuthActorContext): Promise<DashboardVisibilityScope> {
  const agentIds = auth.agentScope.length > 0 ? auth.agentScope : [EMPTY_UUID];

  if (auth.user.isSuperAdmin) {
    return {
      agentIds,
      contractIds: [],
      contractParticipantAgentIds: [],
      contractActorNames: [],
      projectIds: [],
      webhookIds: [],
    };
  }

  const supabase = createServerClient();

  const [{ data: participantContracts }, { data: memberProjects }, { data: userWebhooks }] = await Promise.all([
    supabase.from('contract_participants').select('contract_id').in('agent_id', agentIds),
    supabase.from('project_members').select('project_id').in('agent_id', agentIds),
    supabase.from('webhooks').select('id').in('agent_id', agentIds),
  ]);

  const contractIds = unique((participantContracts || []).map((row) => row.contract_id));
  const projectIds = unique((memberProjects || []).map((row) => row.project_id));
  const webhookIds = unique((userWebhooks || []).map((row) => row.id));

  let contractParticipantAgentIds = [...agentIds];
  if (contractIds.length > 0) {
    const { data: allParticipants } = await supabase
      .from('contract_participants')
      .select('agent_id')
      .in('contract_id', contractIds);

    contractParticipantAgentIds = unique([
      ...agentIds,
      ...(allParticipants || []).map((row) => row.agent_id),
    ]);
  }

  let contractActorNames: string[] = [];
  if (contractParticipantAgentIds.length > 0) {
    const { data: agents } = await supabase
      .from('agents')
      .select('name')
      .in('id', contractParticipantAgentIds);

    contractActorNames = unique([
      ...(agents || []).map((agent) => agent.name),
      auth.user.displayName,
      'dashboard',
    ]);
  } else {
    contractActorNames = [auth.user.displayName, 'dashboard'];
  }

  return {
    agentIds,
    contractIds,
    contractParticipantAgentIds,
    contractActorNames,
    projectIds,
    webhookIds,
  };
}
