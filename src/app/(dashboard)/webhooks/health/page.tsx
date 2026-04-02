import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import WebhookFilterCard from './webhook-filter-card';

export const dynamic = 'force-dynamic';

type WebhookDelivery = {
  id: string;
  webhook_id: string;
  event: string;
  status: 'pending' | 'pending_retry' | 'retrying' | 'success' | 'failed';
  attempts: number;
  response_status: number | null;
  delivered_at: string | null;
  created_at: string;
  max_retries: number;
  last_retry_at: string | null;
  webhooks: {
    id: string;
    url: string;
    agent_id: string;
    is_active: boolean;
    failure_count: number;
    last_delivery_at: string | null;
  };
};

type WebhookSummary = {
  webhookId: string;
  url: string;
  agentId: string;
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt: string | null;
  successCount24h: number;
  failedCount24h: number;
  pendingCount24h: number;
  retryCount24h: number;
  totalCount24h: number;
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Success
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Failed
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Pending
        </span>
      );
    case 'pending_retry':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          Pending Retry
        </span>
      );
    case 'retrying':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Retrying
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">
          {status}
        </span>
      );
  }
}

function truncateUrl(url: string, maxLen = 40) {
  if (url.length <= maxLen) return url;
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname;
    const truncated = host + (path.length > 20 ? path.slice(0, 17) + '...' : path);
    return truncated.length > maxLen ? truncated.slice(0, maxLen - 3) + '...' : truncated;
  } catch {
    return url.slice(0, maxLen - 3) + '...';
  }
}

function formatTimestamp(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default async function WebhookHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ webhook?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  if (!user.isSuperAdmin) redirect('/');

  const params = await searchParams;
  const filterWebhookId = params.webhook || null;

  const supabase = createServerClient();
  noStore();

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent deliveries (last 50), optionally filtered by webhook + failures only
  let deliveriesQuery = supabase
    .from('webhook_deliveries')
    .select(`
      id,
      webhook_id,
      event,
      status,
      attempts,
      response_status,
      delivered_at,
      created_at,
      max_retries,
      last_retry_at,
      webhooks!inner(id, url, agent_id, is_active, failure_count, last_delivery_at)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filterWebhookId) {
    deliveriesQuery = deliveriesQuery
      .eq('webhook_id', filterWebhookId)
      .eq('status', 'failed');
  }

  const { data: recentDeliveries } = await deliveriesQuery;
  const deliveries = (recentDeliveries || []) as unknown as WebhookDelivery[];

  // Fetch deliveries in last 24h for summary stats (always unfiltered)
  const { data: last24hDeliveries } = await supabase
    .from('webhook_deliveries')
    .select(`
      id,
      webhook_id,
      status,
      attempts,
      webhooks!inner(id, url, agent_id, is_active, failure_count, last_delivery_at)
    `)
    .gte('created_at', twentyFourHoursAgo);

  const stats24h = (last24hDeliveries || []) as unknown as Array<{
    id: string;
    webhook_id: string;
    status: string;
    attempts: number;
    webhooks: {
      id: string;
      url: string;
      agent_id: string;
      is_active: boolean;
      failure_count: number;
      last_delivery_at: string | null;
    };
  }>;

  // Build per-webhook summaries
  const summaryMap = new Map<string, WebhookSummary>();
  for (const d of stats24h) {
    const wid = d.webhook_id;
    if (!summaryMap.has(wid)) {
      summaryMap.set(wid, {
        webhookId: wid,
        url: d.webhooks.url,
        agentId: d.webhooks.agent_id,
        isActive: d.webhooks.is_active,
        failureCount: d.webhooks.failure_count,
        lastDeliveryAt: d.webhooks.last_delivery_at,
        successCount24h: 0,
        failedCount24h: 0,
        pendingCount24h: 0,
        retryCount24h: 0,
        totalCount24h: 0,
      });
    }
    const s = summaryMap.get(wid)!;
    s.totalCount24h++;
    if (d.status === 'success') s.successCount24h++;
    else if (d.status === 'failed') s.failedCount24h++;
    else if (d.status === 'pending_retry' || d.status === 'retrying') s.retryCount24h++;
    else s.pendingCount24h++;
  }

  const summaries = Array.from(summaryMap.values()).sort((a, b) => b.totalCount24h - a.totalCount24h);

  // Overall stats
  const totalDeliveries24h = stats24h.length;
  const totalSuccess = stats24h.filter(d => d.status === 'success').length;
  const totalFailed = stats24h.filter(d => d.status === 'failed').length;
  const totalPending = stats24h.filter(d => d.status === 'pending').length;
  const totalRetrying = stats24h.filter(d => d.status === 'pending_retry' || d.status === 'retrying').length;
  const successRate = totalDeliveries24h > 0 ? Math.round((totalSuccess / totalDeliveries24h) * 100) : 0;

  // Resolve filtered webhook name for display
  const filteredWebhookUrl = filterWebhookId
    ? summaries.find(s => s.webhookId === filterWebhookId)?.url || filterWebhookId
    : null;

  return (
    <AutoRefresh intervalMs={30000}>
      <div className="p-4 sm:p-6 lg:p-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 animate-fade-in">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                href="/webhooks"
                className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] hover:text-cyan-400 transition-colors"
              >
                Webhooks
              </Link>
              <span className="text-gray-700">/</span>
              <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em]">
                Delivery Health
              </p>
            </div>
            <h1 className="text-[32px] font-bold text-white tracking-tight">Webhook Health</h1>
            <p className="text-sm text-gray-600 mt-1">Delivery status monitoring &amp; diagnostics</p>
          </div>
          <Link
            href="/webhooks"
            className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-gray-400 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:text-white transition-all duration-200 flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Webhooks
          </Link>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <div className="rounded-2xl glass-card px-5 py-4">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1">24h Total</p>
            <p className="text-2xl font-bold text-white tabular-nums">{totalDeliveries24h}</p>
          </div>
          <div className="rounded-2xl glass-card px-5 py-4">
            <p className="text-[10px] font-semibold text-emerald-500/60 uppercase tracking-[0.2em] mb-1">Success</p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{totalSuccess}</p>
          </div>
          <div className="rounded-2xl glass-card px-5 py-4">
            <p className="text-[10px] font-semibold text-red-500/60 uppercase tracking-[0.2em] mb-1">Failed</p>
            <p className="text-2xl font-bold text-red-400 tabular-nums">{totalFailed}</p>
          </div>
          <div className="rounded-2xl glass-card px-5 py-4">
            <p className="text-[10px] font-semibold text-blue-500/60 uppercase tracking-[0.2em] mb-1">Retrying</p>
            <p className="text-2xl font-bold text-blue-400 tabular-nums">{totalRetrying}</p>
          </div>
          <div className="rounded-2xl glass-card px-5 py-4">
            <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.2em] mb-1">Success Rate</p>
            <p className="text-2xl font-bold tabular-nums">
              <span className={successRate >= 90 ? 'text-emerald-400' : successRate >= 70 ? 'text-amber-400' : 'text-red-400'}>
                {successRate}%
              </span>
            </p>
          </div>
        </div>

        {/* Per-Webhook Summary Cards (clickable for drill-down) */}
        {summaries.length > 0 && (
          <div className="mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h2 className="text-[13px] font-semibold text-white mb-4 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-500/60">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              Per-Webhook Summary
              <span className="text-[10px] text-gray-600 font-normal ml-1">(last 24h · click to filter failures)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {summaries.map((s, idx) => (
                <WebhookFilterCard
                  key={s.webhookId}
                  webhookId={s.webhookId}
                  isActive={s.isActive}
                  url={s.url}
                  agentId={s.agentId}
                  failureCount={s.failureCount}
                  lastDeliveryAt={s.lastDeliveryAt}
                  successCount24h={s.successCount24h}
                  failedCount24h={s.failedCount24h}
                  pendingCount24h={s.pendingCount24h}
                  retryCount24h={s.retryCount24h}
                  totalCount24h={s.totalCount24h}
                  animationDelay={`${0.1 + idx * 0.04}s`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filter indicator */}
        {filterWebhookId && (
          <div className="mb-4 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/10 px-4 py-3 animate-fade-in flex items-center justify-between">
            <p className="text-[11px] text-cyan-400/80">
              <span className="font-semibold">Filtered:</span> Showing failures for{' '}
              <span className="font-mono text-cyan-300">{truncateUrl(filteredWebhookUrl || '', 60)}</span>
            </p>
            <Link
              href="/webhooks/health"
              className="text-[10px] font-semibold text-gray-500 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/[0.04]"
            >
              Clear filter
            </Link>
          </div>
        )}

        {/* Recent Deliveries Table */}
        <div className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <h2 className="text-[13px] font-semibold text-white mb-4 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-500/60">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {filterWebhookId ? 'Failed Deliveries' : 'Recent Deliveries'}
            <span className="text-[10px] text-gray-600 font-normal ml-1">
              {filterWebhookId ? `(${deliveries.length} failures)` : '(last 50)'}
            </span>
          </h2>

          {deliveries.length === 0 ? (
            <div className="rounded-2xl glass-card px-6 py-16 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 font-medium">
                {filterWebhookId ? 'No failures found' : 'No deliveries recorded'}
              </p>
              <p className="text-[11px] text-gray-700 mt-1">
                {filterWebhookId
                  ? 'This webhook has no failed deliveries in the last 50 attempts.'
                  : 'Webhook deliveries will appear here once events are dispatched.'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Event</th>
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Status</th>
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em]">HTTP</th>
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Attempts</th>
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Webhook</th>
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Created</th>
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d, idx) => (
                      <tr
                        key={d.id}
                        className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors duration-150 animate-fade-in"
                        style={{ animationDelay: `${0.15 + idx * 0.02}s` }}
                      >
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-500/[0.06] px-1.5 py-0.5 rounded">
                            {d.event}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(d.status)}
                        </td>
                        <td className="px-4 py-3">
                          {d.response_status ? (
                            <span className={`text-[11px] font-mono tabular-nums ${
                              d.response_status >= 200 && d.response_status < 300
                                ? 'text-emerald-400'
                                : d.response_status >= 400
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                            }`}>
                              {d.response_status}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-mono tabular-nums ${d.attempts > 1 ? 'text-amber-400' : 'text-gray-500'}`}>
                            {d.attempts}/{d.max_retries}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-mono text-gray-500" title={d.webhooks.url}>
                            {truncateUrl(d.webhooks.url)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] text-gray-500 tabular-nums" title={d.created_at}>
                            {formatTimestamp(d.created_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] text-gray-500 tabular-nums" title={d.delivered_at || undefined}>
                            {d.delivered_at ? formatTimestamp(d.delivered_at) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pending count note */}
        {(totalPending > 0 || totalRetrying > 0) && !filterWebhookId && (
          <div className="mt-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/10 px-4 py-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <p className="text-[11px] text-amber-400/80">
              <span className="font-semibold">{totalPending + totalRetrying}</span> deliveries pending or retrying in the last 24h.
            </p>
          </div>
        )}
      </div>
    </AutoRefresh>
  );
}
