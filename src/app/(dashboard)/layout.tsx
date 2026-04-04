import DashboardShell from '@/components/dashboard-shell';
import { getAuthUser } from '@/lib/auth-context';
import { getDashboardNotificationSummary } from '@/lib/dashboard-notifications';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  const notificationSummary = user ? await getDashboardNotificationSummary(user) : null;

  return (
    <DashboardShell
      isSuperAdmin={user?.isSuperAdmin ?? false}
      displayName={user?.displayName ?? undefined}
      notificationCounts={notificationSummary?.counts}
    >
      {children}
    </DashboardShell>
  );
}
