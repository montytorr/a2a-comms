import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect } from 'next/navigation';
import ApprovalList from './approval-list';
import AutoRefresh from '@/components/auto-refresh';
import { getDashboardApprovalVisibility } from '@/lib/approval-trust-policy';
import { ShieldCheck } from 'lucide-react';
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const visibility = await getDashboardApprovalVisibility(auth);
  if (!visibility.canViewPage) redirect('/');

  const params = await searchParams;
  const filter = params.filter || 'pending';

  const supabase = createServerClient();
  noStore();

  let query = supabase
    .from('pending_approvals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!user.isSuperAdmin) {
    if (visibility.allowedApprovalIds && visibility.allowedApprovalIds.length > 0) {
      query = query.in('id', visibility.allowedApprovalIds);
    } else if (visibility.visibleActors.length > 0) {
      query = query.in('actor', visibility.visibleActors);
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  if (filter !== 'all') {
    query = query.eq('status', filter);
  }

  const { data: approvals } = await query;
  const rows = (approvals || []) as Array<{
    id: string;
    action: string;
    actor: string;
    details: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied' | 'consumed';
    reviewed_by: string | null;
    created_at: string;
    reviewed_at: string | null;
  }>;

  // Count pending for badge
  let pendingCountQuery = supabase
    .from('pending_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (!user.isSuperAdmin) {
    if (visibility.allowedApprovalIds && visibility.allowedApprovalIds.length > 0) {
      pendingCountQuery = pendingCountQuery.in('id', visibility.allowedApprovalIds);
    } else if (visibility.visibleActors.length > 0) {
      pendingCountQuery = pendingCountQuery.in('actor', visibility.visibleActors);
    } else {
      pendingCountQuery = pendingCountQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  const { count: pendingCount } = await pendingCountQuery;

  const filters = ['pending', 'approved', 'consumed', 'denied', 'all'] as const;

  return (
    <AutoRefresh intervalMs={10000}>
      <div style={{ padding: '28px 32px 60px', maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div className="row gap-3" style={{ marginBottom: 8 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--amber-bg)',
              border: '1px solid oklch(0.55 0.12 60 / 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ShieldCheck size={16} style={{ color: 'var(--amber)' }} />
            </div>
            <div>
              <p className="upper" style={{ marginBottom: 2 }}>System</p>
              <h1 className="h1">Approvals</h1>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
            Review and approve sensitive operations. Key rotation requires approval from another admin; admin-triggered kill switch activations are auto-approved.
            {(pendingCount ?? 0) > 0 && (
              <span className="pill pill--amber" style={{ marginLeft: 8 }}>
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>

        {/* Filter tabs using .seg */}
        <div className="seg" style={{ marginBottom: 24 }}>
          {filters.map((f) => (
            <a
              key={f}
              href={`/approvals${f === 'pending' ? '' : `?filter=${f}`}`}
              style={{ textDecoration: 'none' }}
            >
              <button className={filter === f ? 'active' : ''} style={{ textTransform: 'capitalize' }}>
                {f}
              </button>
            </a>
          ))}
        </div>

        {/* List */}
        <ApprovalList
          approvals={rows}
          currentUser={user.displayName}
          isSuperAdmin={user.isSuperAdmin}
        />
      </div>
    </AutoRefresh>
  );
}
