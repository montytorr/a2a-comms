import DashboardShell from '@/components/dashboard-shell';
import { getAuthUser } from '@/lib/auth-context';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  return (
    <DashboardShell
      isSuperAdmin={user?.isSuperAdmin ?? false}
      displayName={user?.displayName ?? undefined}
    >
      {children}
    </DashboardShell>
  );
}
