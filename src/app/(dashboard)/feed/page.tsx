import { redirect } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import FeedClient from './feed-client';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const scope = await buildDashboardVisibilityScope(auth);

  return (
    <FeedClient
      isSuperAdmin={user.isSuperAdmin}
      agentIds={scope.agentIds}
      agentNames={scope.contractActorNames}
      contractIds={scope.contractIds}
    />
  );
}
