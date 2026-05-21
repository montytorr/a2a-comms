'use server';

import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase/server';

export interface NotificationPreferences {
  welcome: boolean;
  contract_invitation: boolean;
  task_assigned: boolean;
  approval_request: boolean;
  project_member_invitation: boolean;
  stale_blocker: boolean;
}

export async function updateNotificationPreferences(
  prefs: NotificationPreferences
): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createSSRClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          },
        },
      }
    );

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const supabase = createServerClient();
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from('notification_preferences')
      .select('updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error, count } = await supabase
        .from('notification_preferences')
        .update({
          welcome: prefs.welcome,
          contract_invitation: prefs.contract_invitation,
          task_assigned: prefs.task_assigned,
          approval_request: prefs.approval_request,
          project_member_invitation: prefs.project_member_invitation,
          stale_blocker: prefs.stale_blocker,
          updated_at: now,
        })
        .eq('user_id', user.id)
        .eq('updated_at', existing.updated_at);

      if (error) return { success: false, error: error.message };
      if (count === 0) return { success: false, error: 'Preferences were modified by another session. Please reload and try again.' };
    } else {
      const { error } = await supabase
        .from('notification_preferences')
        .insert({
          user_id: user.id,
          welcome: prefs.welcome,
          contract_invitation: prefs.contract_invitation,
          task_assigned: prefs.task_assigned,
          approval_request: prefs.approval_request,
          project_member_invitation: prefs.project_member_invitation,
          stale_blocker: prefs.stale_blocker,
          updated_at: now,
        });
      if (error) return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
