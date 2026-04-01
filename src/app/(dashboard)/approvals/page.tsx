import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import ApprovalList from './approval-list';
import AutoRefresh from '@/components/auto-refresh';
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  if (!user.isSuperAdmin) redirect('/');

  const params = await searchParams;
  const filter = params.filter || 'pending';

  const supabase = createServerClient();
  noStore();

  let query = supabase
    .from('pending_approvals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

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
  const { count: pendingCount } = await supabase
    .from('pending_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return (
    <AutoRefresh intervalMs={10000}>
      <div className="p-4 sm:p-6 lg:p-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-600/15 border border-amber-500/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <path d="M9 12l2 2 4-4" />
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-[0.25em]">System</p>
              <h1 className="text-[28px] font-bold text-white tracking-tight">Approvals</h1>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            Review and approve sensitive operations. Kill switch activation and key rotation require approval from another admin.
            {(pendingCount ?? 0) > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04] w-fit">
          {(['pending', 'approved', 'consumed', 'denied', 'all'] as const).map((f) => (
            <a
              key={f}
              href={`/approvals${f === 'pending' ? '' : `?filter=${f}`}`}
              className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 capitalize ${
                filter === f
                  ? 'bg-white/[0.06] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.02]'
              }`}
            >
              {f}
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
