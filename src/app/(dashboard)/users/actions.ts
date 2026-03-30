'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';

export async function toggleSuperAdmin(
  userId: string,
  newValue: boolean
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Not authenticated' };
  if (!user.isSuperAdmin) return { error: 'Admin access required' };

  // Prevent removing your own admin
  if (userId === user.id && !newValue) {
    return { error: 'Cannot remove your own super admin status' };
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from('user_profiles')
    .update({ is_super_admin: newValue })
    .eq('id', userId);

  if (error) return { error: error.message };

  // Audit
  await supabase.from('audit_log').insert({
    actor: user.displayName,
    action: newValue ? 'user.promote_admin' : 'user.demote_admin',
    resource_type: 'user',
    resource_id: userId,
    details: { toggled_by: user.email },
  });

  return {};
}

export async function linkAgentToUser(
  agentId: string,
  userId: string
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Not authenticated' };
  if (!user.isSuperAdmin) return { error: 'Admin access required' };

  const supabase = createServerClient();

  const { error } = await supabase
    .from('agents')
    .update({ owner_user_id: userId })
    .eq('id', agentId);

  if (error) return { error: error.message };

  // Audit
  await supabase.from('audit_log').insert({
    actor: user.displayName,
    action: 'user.link_agent',
    resource_type: 'agent',
    resource_id: agentId,
    details: { user_id: userId, linked_by: user.email },
  });

  return {};
}

export async function unlinkAgent(
  agentId: string
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Not authenticated' };
  if (!user.isSuperAdmin) return { error: 'Admin access required' };

  const supabase = createServerClient();

  const { error } = await supabase
    .from('agents')
    .update({ owner_user_id: null })
    .eq('id', agentId);

  if (error) return { error: error.message };

  // Audit
  await supabase.from('audit_log').insert({
    actor: user.displayName,
    action: 'user.unlink_agent',
    resource_type: 'agent',
    resource_id: agentId,
    details: { unlinked_by: user.email },
  });

  return {};
}

export async function getUnlinkedAgents(): Promise<
  Array<{ id: string; name: string; display_name: string }>
> {
  const user = await getAuthUser();
  if (!user || !user.isSuperAdmin) return [];

  const supabase = createServerClient();
  const { data } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .is('owner_user_id', null)
    .order('name');

  return data || [];
}
