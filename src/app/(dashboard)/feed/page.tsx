import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-context';
import { createServerClient } from '@/lib/supabase/server';
import FeedClient from './feed-client';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  const isAdmin = user.isSuperAdmin;
  const agentIds = user.agentIds;

  // Get contract IDs the user's agents participate in
  let contractIds: string[] = [];
  if (!isAdmin && agentIds.length > 0) {
    const { data: participants } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', agentIds);
    contractIds = (participants || []).map(p => p.contract_id);
  }

  // Get agent names for audit log scoping — include counterparty agents from shared contracts
  let agentNames: string[] = [];
  if (!isAdmin) {
    // Start with owned agent IDs
    const allScopedAgentIds = new Set(agentIds);

    // Also get ALL agent IDs from contracts the user participates in (counterparties)
    if (contractIds.length > 0) {
      const { data: allParticipants } = await supabase
        .from('contract_participants')
        .select('agent_id')
        .in('contract_id', contractIds);
      for (const p of allParticipants || []) {
        allScopedAgentIds.add(p.agent_id);
      }
    }

    // Fetch names for all scoped agent IDs
    const safeIds = allScopedAgentIds.size > 0 ? [...allScopedAgentIds] : ['00000000-0000-0000-0000-000000000000'];
    const { data: agents } = await supabase
      .from('agents')
      .select('name')
      .in('id', safeIds);
    agentNames = (agents || []).map(a => a.name);
  }

  return (
    <FeedClient
      isSuperAdmin={isAdmin}
      agentIds={agentIds}
      agentNames={agentNames}
      contractIds={contractIds}
    />
  );
}
