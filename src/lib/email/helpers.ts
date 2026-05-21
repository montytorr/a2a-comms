import { createServerClient } from '@/lib/supabase/server';

/**
 * Look up a user's email from their auth user ID.
 * Uses Supabase auth.admin (requires service role key).
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(`Failed to look up user email for ${userId}: ${error.message}`);
  }
  if (!data?.user?.email) return null;
  return data.user.email;
}

/**
 * Look up emails for all super_admin users.
 * Returns array of { email, userId } for notification targeting.
 */
export async function getSuperAdminEmails(): Promise<Array<{ email: string; userId: string }>> {
  const supabase = createServerClient();
  const { data: admins, error } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('is_super_admin', true);

  if (error) {
    throw new Error(`Failed to fetch super admin profiles: ${error.message}`);
  }

  if (!admins || admins.length === 0) return [];

  const results: Array<{ email: string; userId: string }> = [];
  for (const admin of admins) {
    const email = await getUserEmail(admin.id);
    if (email) {
      results.push({ email, userId: admin.id });
    }
  }
  return results;
}

/**
 * Look up the human owner's email for a given agent name.
 * Returns { email, userId } or null if agent has no owner or owner has no email.
 */
export async function getAgentOwnerEmail(agentName: string): Promise<{ email: string; userId: string } | null> {
  const supabase = createServerClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('name', agentName)
    .single();

  if (error) {
    throw new Error(`Failed to look up agent owner for ${agentName}: ${error.message}`);
  }

  if (!agent?.owner_user_id) return null;

  const email = await getUserEmail(agent.owner_user_id);
  if (!email) return null;

  return { email, userId: agent.owner_user_id };
}

/**
 * Approval email routing: determines whether an approval action
 * should notify the agent's owner, super_admins, or both.
 *
 * Owner-scoped (agent's human gets the email):
 *   key.rotate, contract.*, webhook.*, and any unknown/general action
 *
 * Admin-scoped (super_admins get the email):
 *   kill_switch.*, agent.delete, admin.*, platform.*
 */
export type ApprovalScope = 'owner' | 'admin';

const ADMIN_PREFIXES = ['kill_switch', 'killswitch', 'agent.delete', 'admin', 'platform'];

export function getApprovalScope(action: string): ApprovalScope {
  const lower = action.toLowerCase();
  for (const prefix of ADMIN_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix}.`)) {
      return 'admin';
    }
  }
  return 'owner';
}
