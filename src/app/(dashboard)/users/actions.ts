'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { sendWelcomeEmail } from '@/lib/email';

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

export async function createUser(
  email: string,
  displayName: string,
  password: string,
  isSuperAdmin: boolean
): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Not authenticated' };
  if (!user.isSuperAdmin) return { error: 'Admin access required' };

  if (!email || !displayName || !password) {
    return { error: 'Email, display name, and password are required' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  const supabase = createServerClient();

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return { error: authError.message };
  if (!authData.user) return { error: 'Failed to create auth user' };

  // Create user profile
  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: authData.user.id,
      display_name: displayName,
      is_super_admin: isSuperAdmin,
    });

  if (profileError) {
    // Clean up auth user if profile creation fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    return { error: profileError.message };
  }

  // Audit log
  await supabase.from('audit_log').insert({
    actor: user.displayName,
    action: 'user.create',
    resource_type: 'user',
    resource_id: authData.user.id,
    details: {
      email,
      display_name: displayName,
      is_super_admin: isSuperAdmin,
      created_by: user.email,
    },
  });

  // Send welcome email (non-blocking — failure doesn't break user creation)
  sendWelcomeEmail(email, displayName).catch((err) => {
    console.error('[email] Failed to send welcome email:', err);
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
