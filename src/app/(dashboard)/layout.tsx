import DashboardShell from '@/components/dashboard-shell';
import { getAuthActorContext } from '@/lib/auth-actor-context';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  return (
    <DashboardShell
      isSuperAdmin={user?.isSuperAdmin ?? false}
      displayName={user?.displayName ?? undefined}
      // Header enrichment is loaded by the client after the shell paints.
      // Keeping it out of this layout lets the route loading boundary stream.
      notificationCounts={undefined}
      initialTickerItems={[]}
      actor={{
        availableAgents: auth?.availableAgents || [],
        activeAgentId: auth?.actingAgentId || null,
        trustTier: auth?.trustTier || 'external',
        trustPolicy: auth?.trustPolicy || {
          webhooks: { management: 'partner' },
          observer_project_access: { read: 'partner', download_project_attachments: 'partner' },
          project_participants: { list_members: 'partner', list_observers: 'partner' },
          project_invitations: { list_pending: 'internal' },
        },
        fallbackMode: auth?.fallbackMode || 'least-privilege',
      }}
    >
      {children}
    </DashboardShell>
  );
}
