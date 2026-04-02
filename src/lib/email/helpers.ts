import { createServerClient } from '@/lib/supabase/server';

/**
 * Look up a user's email from their auth user ID.
 * Uses Supabase auth.admin (requires service role key).
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    return data.user.email;
  } catch {
    return null;
  }
}

/**
 * Look up emails for all super_admin users.
 * Returns array of { email, userId } for notification targeting.
 */
export async function getSuperAdminEmails(): Promise<Array<{ email: string; userId: string }>> {
  try {
    const supabase = createServerClient();
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('is_super_admin', true);

    if (!admins || admins.length === 0) return [];

    const results: Array<{ email: string; userId: string }> = [];
    for (const admin of admins) {
      const email = await getUserEmail(admin.id);
      if (email) {
        results.push({ email, userId: admin.id });
      }
    }
    return results;
  } catch {
    return [];
  }
}
