import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase/server';
import NotificationSettingsClient from './notification-settings-client';
import type { NotificationPreferences } from './actions';

export default async function SettingsPage() {
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
  if (!user) redirect('/login');

  // Fetch current preferences (service role to bypass RLS for initial load)
  const supabase = createServerClient();
  const { data } = await supabase
    .from('notification_preferences')
    .select('welcome, contract_invitation, task_assigned, approval_request, project_member_invitation')
    .eq('user_id', user.id)
    .single();

  const initialPrefs: NotificationPreferences = {
    welcome: data?.welcome ?? true,
    contract_invitation: data?.contract_invitation ?? true,
    task_assigned: data?.task_assigned ?? true,
    approval_request: data?.approval_request ?? true,
    project_member_invitation: data?.project_member_invitation ?? true,
  };

  return <NotificationSettingsClient initialPrefs={initialPrefs} />;
}
