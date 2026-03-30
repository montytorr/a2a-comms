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

  // Get agent names for audit log scoping
  let agentNames: string[] = [];
  if (!isAdmin && agentIds.length > 0) {
    const { data: agents } = await supabase
      .from('agents')
      .select('name')
      .in('id', agentIds);
    agentNames = (agents || []).map(a => a.name);
  }

  // Get contract IDs the user's agents participate in
  let contractIds: string[] = [];
  if (!isAdmin && agentIds.length > 0) {
    const { data: participants } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', agentIds);
    contractIds = (participants || []).map(p => p.contract_id);
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
