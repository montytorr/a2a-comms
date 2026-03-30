import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import UsersClient from './users-client';
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  if (!user.isSuperAdmin) redirect('/?error=admin_required');

  const supabase = createServerClient();
  noStore();

  // Fetch all profiles
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: true });

  // Fetch all agents with owner_user_id
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, display_name, owner, owner_user_id, capabilities')
    .order('name', { ascending: true });

  // Fetch auth users' emails from auth.users via admin API
  const profileList = profiles || [];
  const agentList = agents || [];

  // Get emails for each profile
  const profilesWithEmail = await Promise.all(
    profileList.map(async (profile) => {
      const { data: authData } = await supabase.auth.admin.getUserById(profile.id);
      return {
        ...profile,
        email: authData?.user?.email || 'unknown',
      };
    })
  );

  // Group agents by owner
  const agentsByOwner = new Map<string, typeof agentList>();
  for (const agent of agentList) {
    const ownerId = agent.owner_user_id || '__unlinked__';
    if (!agentsByOwner.has(ownerId)) {
      agentsByOwner.set(ownerId, []);
    }
    agentsByOwner.get(ownerId)!.push(agent);
  }

  const unlinkedAgents = agentsByOwner.get('__unlinked__') || [];

  return (
    <UsersClient
      profiles={profilesWithEmail}
      agentsByOwner={Object.fromEntries(agentsByOwner)}
      unlinkedAgents={unlinkedAgents}
      currentUserId={user.id}
    />
  );
}
