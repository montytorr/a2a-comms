import { redirect } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import { createServerClient } from '@/lib/supabase/server';
import FeedClient from './feed-client';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const scope = await buildDashboardVisibilityScope(auth);

  const supabase = createServerClient();
  const ownAgentIds = auth.agentScope;
  let ownAgentNames: string[] = [];
  if (!user.isSuperAdmin && ownAgentIds.length > 0) {
    const { data: ownAgents } = await supabase
      .from('agents')
      .select('name')
      .in('id', ownAgentIds);
    ownAgentNames = [...new Set([
      ...(ownAgents || []).map((a: { name: string }) => a.name),
      auth.user.displayName,
    ])];
  }

  return (
    <FeedClient
      isSuperAdmin={user.isSuperAdmin}
      agentIds={scope.agentIds}
      agentNames={user.isSuperAdmin ? scope.contractActorNames : ownAgentNames}
      contractIds={scope.contractIds}
    />
  );
}
