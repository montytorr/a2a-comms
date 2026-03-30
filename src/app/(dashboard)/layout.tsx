import Sidebar from '@/components/sidebar';
import { getAuthUser } from '@/lib/auth-context';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isSuperAdmin={user?.isSuperAdmin ?? false}
        displayName={user?.displayName ?? undefined}
      />
      <main className="flex-1 ml-[240px] min-h-screen relative">
        {/* Subtle top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent" />
        <div className="max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
