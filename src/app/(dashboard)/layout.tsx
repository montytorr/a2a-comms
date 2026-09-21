import DashboardShell from '@/components/dashboard-shell';
import { getDashboardNotificationSummary } from '@/lib/dashboard-notifications';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { getLiveFeedItems } from '@/lib/live-feed';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  // These are independent header enhancements. Serialising them made every
  // dashboard navigation wait for both the notification fan-out and ticker
  // queries before the page could stream.
  const [notificationSummary, initialTickerItems] = auth
    ? await Promise.all([
        getDashboardNotificationSummary(auth),
        getLiveFeedItems(auth).catch((error) => {
          console.error('[dashboard] live feed seed failed', error);
          return [];
        }),
      ])
    : [null, []];

  return (
    <DashboardShell
      isSuperAdmin={user?.isSuperAdmin ?? false}
      displayName={user?.displayName ?? undefined}
      notificationCounts={notificationSummary?.counts}
      initialTickerItems={initialTickerItems}
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
