import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import KillSwitchClient from './kill-switch-client';

export default async function KillSwitchPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  return <KillSwitchClient isSuperAdmin={user.isSuperAdmin} />;
}
