'use server';

import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase/server';

export interface NotificationPreferences {
  welcome: boolean;
  contract_invitation: boolean;
  task_assigned: boolean;
  approval_request: boolean;
}

export async function updateNotificationPreferences(
  prefs: NotificationPreferences
): Promise<{ success: boolean; error?: string }> {
  try {
    // Auth check
    const cookieStore = await cookies();
    const supabaseAuth = createSSRClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const supabase = createServerClient();

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        welcome: prefs.welcome,
        contract_invitation: prefs.contract_invitation,
        task_assigned: prefs.task_assigned,
        approval_request: prefs.approval_request,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
