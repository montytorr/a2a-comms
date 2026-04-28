import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import { redirect } from 'next/navigation';
import type { AuditLogEntry } from '@/lib/types';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageFrame, SectionHeader } from '@/components/atoms';
import AuditTable from './audit-table';
import AutoRefresh from '@/components/auto-refresh';
import AuditFilters from './audit-filters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const SECURITY_EVENTS = [
  'auth.success', 'auth.failure', 'authz.denied',
  'webhook.delivery.success', 'webhook.delivery.failure', 'webhook.disabled',
  'suspicious.replay_detected', 'suspicious.invalid_signature',
  'policy.kill_switch.activated', 'policy.kill_switch.deactivated',
];

function buildPageUrl(
  p: number,
  actorFilter: string,
  actionFilter: string,
  rangeFilter: string,
): string {
  const parts: string[] = [];
  if (p > 1) parts.push(`page=${p}`);
  if (actorFilter) parts.push(`actor=${encodeURIComponent(actorFilter)}`);
  if (actionFilter !== 'all') parts.push(`action=${encodeURIComponent(actionFilter)}`);
  if (rangeFilter !== 'all') parts.push(`range=${encodeURIComponent(rangeFilter)}`);
  return `/audit${parts.length ? `?${parts.join('&')}` : ''}`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; actor?: string; action?: string; range?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const actorFilter = params.actor || '';
  const actionFilter = params.action || 'all';
  const rangeFilter = params.range || 'all';
  const supabase = createServerClient();
  noStore();

  const scope = user.isSuperAdmin ? null : await buildDashboardVisibilityScope(auth);
  const scopedActorNames = user.isSuperAdmin ? null : scope?.contractActorNames || [];

  // ── count query ──────────────────────────────────────────────────────────────

  let countQuery = supabase
    .from('audit_log')
    .select('id', { count: 'exact', head: true });

  if (scopedActorNames !== null && scopedActorNames.length > 0) {
    countQuery = countQuery.in('actor', scopedActorNames);
  } else if (scopedActorNames !== null) {
    countQuery = countQuery.eq('actor', '__none__');
  }

  if (actorFilter) {
    countQuery = countQuery.ilike('actor', `%${actorFilter}%`);
  }

  if (actionFilter === 'security') {
    countQuery = countQuery.in('action', SECURITY_EVENTS);
  } else if (actionFilter !== 'all') {
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

  // ── data query ───────────────────────────────────────────────────────────────

  let dataQuery = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false });

  if (scopedActorNames !== null && scopedActorNames.length > 0) {
    dataQuery = dataQuery.in('actor', scopedActorNames);
  } else if (scopedActorNames !== null) {
    dataQuery = dataQuery.eq('actor', '__none__');
  }

  if (actorFilter) {
    dataQuery = dataQuery.ilike('actor', `%${actorFilter}%`);
  }

  if (actionFilter === 'security') {
    dataQuery = dataQuery.in('action', SECURITY_EVENTS);
  } else if (actionFilter !== 'all') {
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

  const formattedTotal = totalCount.toLocaleString();

  return (
    <AutoRefresh intervalMs={15000}>
      <PageFrame maxW={1400}>
        <SectionHeader
          eyebrow="Monitoring"
          title="Audit Log"
          sub={`${formattedTotal} total entries · Page ${page} of ${totalPages}`}
          right={
            <button className="btn btn--sm row gap-2">
              <Download size={13} />
              Export CSV
            </button>
          }
        />

        <AuditFilters />

        <AuditTable entries={rows} />

        {/* Pagination */}
        <div className="row gap-2" style={{ justifyContent: 'center', marginTop: 8 }}>
          {page > 1 ? (
            <a
              href={buildPageUrl(page - 1, actorFilter, actionFilter, rangeFilter)}
              className="btn btn--sm row gap-1"
            >
              <ChevronLeft size={13} />
              Prev
            </a>
          ) : (
            <button className="btn btn--sm row gap-1" disabled style={{ opacity: 0.35, cursor: 'not-allowed' }}>
              <ChevronLeft size={13} />
              Prev
            </button>
          )}

          <span className="mono num" style={{ fontSize: 12, color: 'var(--fg-2)', padding: '0 8px' }}>
            {page} / {totalPages}
          </span>

          {page < totalPages ? (
            <a
              href={buildPageUrl(page + 1, actorFilter, actionFilter, rangeFilter)}
              className="btn btn--sm row gap-1"
            >
              Next
              <ChevronRight size={13} />
            </a>
          ) : (
            <button className="btn btn--sm row gap-1" disabled style={{ opacity: 0.35, cursor: 'not-allowed' }}>
              Next
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </PageFrame>
    </AutoRefresh>
  );
}
