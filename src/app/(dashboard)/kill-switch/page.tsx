import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import KillSwitchClient from './kill-switch-client';
import { getKillSwitchStatus } from './actions';

export default async function KillSwitchPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const initialStatus = await getKillSwitchStatus();

  return <KillSwitchClient isSuperAdmin={user.isSuperAdmin} initialStatus={initialStatus} />;
}
