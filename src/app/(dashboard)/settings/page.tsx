import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/db/server';
import { sessionUser } from '@/lib/auth/session';
import NotificationSettingsClient from './notification-settings-client';
import type { NotificationPreferences } from './actions';

export default async function SettingsPage() {
  const user = await sessionUser();
  if (!user) redirect('/login');

  // Fetch current preferences (service role to bypass RLS for initial load)
  const db = createServerClient();
  const { data } = await db
    .from('notification_preferences')
    .select('welcome, contract_invitation, task_assigned, approval_request, project_member_invitation, stale_blocker')
    .eq('user_id', user.id)
    .single();

  const initialPrefs: NotificationPreferences = {
    welcome: data?.welcome ?? true,
    contract_invitation: data?.contract_invitation ?? true,
    task_assigned: data?.task_assigned ?? true,
    approval_request: data?.approval_request ?? true,
    project_member_invitation: data?.project_member_invitation ?? true,
    stale_blocker: data?.stale_blocker ?? true,
  };

  return <NotificationSettingsClient initialPrefs={initialPrefs} />;
}
