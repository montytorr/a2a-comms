import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import type { AuditLogEntry } from '@/lib/types';
import AuditTable from './audit-table';
import AuditFilters from './audit-filters';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; actor?: string; action?: string; range?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const actorFilter = params.actor || '';
  const actionFilter = params.action || 'all';
  const rangeFilter = params.range || 'all';
  const supabase = createServerClient();
  noStore();

  // For non-admin users, scope to their agent names
  let scopedActorNames: string[] | null = null;
  if (!user.isSuperAdmin) {
    const { data: agentNames } = await supabase
      .from('agents')
      .select('name')
      .in('id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000']);
    scopedActorNames = (agentNames || []).map(a => a.name);
    // Also include the user's display name and 'dashboard' as actors
    scopedActorNames.push(user.displayName, 'dashboard');
  }

  // Build filtered query for count
  let countQuery = supabase
    .from('audit_log')
    .select('id', { count: 'exact', head: true });

  // Scope for non-admin
  if (scopedActorNames !== null && scopedActorNames.length > 0) {
    countQuery = countQuery.in('actor', scopedActorNames);
  } else if (scopedActorNames !== null) {
    countQuery = countQuery.eq('actor', '__none__');
  }

  if (actorFilter) {
    countQuery = countQuery.ilike('actor', `%${actorFilter}%`);
  }
  if (actionFilter !== 'all') {
    countQuery = countQuery.eq('action', actionFilter);
  }
  if (rangeFilter !== 'all') {
    const now = new Date();
    let since: Date;
    if (rangeFilter === 'today') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (rangeFilter === '7d') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    countQuery = countQuery.gte('created_at', since.toISOString());
  }

  const { count } = await countQuery;
  const totalCount = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Build filtered query for data
  let dataQuery = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false });

  // Scope for non-admin
  if (scopedActorNames !== null && scopedActorNames.length > 0) {
    dataQuery = dataQuery.in('actor', scopedActorNames);
  } else if (scopedActorNames !== null) {
    dataQuery = dataQuery.eq('actor', '__none__');
  }

  if (actorFilter) {
    dataQuery = dataQuery.ilike('actor', `%${actorFilter}%`);
  }
  if (actionFilter !== 'all') {
    dataQuery = dataQuery.eq('action', actionFilter);
  }
  if (rangeFilter !== 'all') {
    const now = new Date();
    let since: Date;
    if (rangeFilter === 'today') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (rangeFilter === '7d') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    dataQuery = dataQuery.gte('created_at', since.toISOString());
  }

  dataQuery = dataQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: entries } = await dataQuery;
  const rows = (entries || []) as AuditLogEntry[];

  // Build pagination links preserving filters
  function buildPageUrl(p: number): string {
    const parts: string[] = [];
    if (p > 1) parts.push(`page=${p}`);
    if (actorFilter) parts.push(`actor=${encodeURIComponent(actorFilter)}`);
    if (actionFilter !== 'all') parts.push(`action=${encodeURIComponent(actionFilter)}`);
    if (rangeFilter !== 'all') parts.push(`range=${encodeURIComponent(rangeFilter)}`);
    return `/audit${parts.length ? `?${parts.join('&')}` : ''}`;
  }

  return (
    <div className="p-8 lg:p-10">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Monitoring</p>
        <h1 className="text-[32px] font-bold text-white tracking-tight">Audit Log</h1>
        <p className="text-sm text-gray-600 mt-1">
          <span className="text-gray-400 font-medium tabular-nums">{totalCount}</span> total entries
          <span className="text-gray-700 mx-1.5">·</span>
          Page <span className="text-gray-400 font-medium tabular-nums">{page}</span> of {totalPages}
        </p>
      </div>

      {/* Filters */}
      <AuditFilters />

      {/* Table */}
      <AuditTable entries={rows} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          {page > 1 && (
            <a
              href={buildPageUrl(page - 1)}
              className="px-4 py-2 text-[11px] font-semibold text-gray-500 border border-white/[0.04] hover:border-white/[0.08] hover:text-gray-300 hover:bg-white/[0.02] rounded-xl transition-all duration-300"
            >
              ← Previous
            </a>
          )}
          <span className="text-[11px] text-gray-700 px-3 font-mono tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={buildPageUrl(page + 1)}
              className="px-4 py-2 text-[11px] font-semibold text-gray-500 border border-white/[0.04] hover:border-white/[0.08] hover:text-gray-300 hover:bg-white/[0.02] rounded-xl transition-all duration-300"
            >
              Next →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
