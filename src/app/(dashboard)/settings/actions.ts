'use server';

import { createServerClient } from '@/lib/db/server';
import { sessionUser } from '@/lib/auth/session';

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
    const user = await sessionUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const db = createServerClient();
    const now = new Date().toISOString();

    const { data: existing } = await db
      .from('notification_preferences')
      .select('updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error, count } = await db
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
      const { error } = await db
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
