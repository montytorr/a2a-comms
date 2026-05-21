import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import WebhookFilterCard from './webhook-filter-card';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import { ArrowLeft, Clock, Info } from 'lucide-react';

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

function getStatusPill(status: string) {
  switch (status) {
    case 'success':
      return <span className="pill pill--mint"><span className="dot dot--mint" />Success</span>;
    case 'failed':
      return <span className="pill pill--rose"><span className="dot dot--rose" />Failed</span>;
    case 'pending':
      return <span className="pill pill--amber"><span className="dot dot--amber pulse" />Pending</span>;
    case 'pending_retry':
      return <span className="pill pill--amber"><span className="dot dot--amber pulse" />Pending Retry</span>;
    case 'retrying':
      return <span className="pill pill--peri"><span className="dot dot--peri pulse" />Retrying</span>;
    default:
      return <span className="pill">{status}</span>;
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
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const { isSuperAdmin } = user;

  const params = await searchParams;
  const filterWebhookId = params.webhook || null;

  const supabase = createServerClient();
  noStore();

  // eslint-disable-next-line react-hooks/purity -- server component with noStore(), Date.now() is intentional
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Resolve visible webhook IDs from the current acting-agent scope.
  const scope = await buildDashboardVisibilityScope(auth);
  const userWebhookIds: string[] = !isSuperAdmin ? scope.webhookIds : [];

  const hasWebhooks = isSuperAdmin || userWebhookIds.length > 0;
  const needsScope = !isSuperAdmin && hasWebhooks;

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

  if (needsScope) {
    deliveriesQuery = deliveriesQuery.in('webhook_id', userWebhookIds);
  }

  if (filterWebhookId) {
    deliveriesQuery = deliveriesQuery
      .eq('webhook_id', filterWebhookId)
      .eq('status', 'failed')
      .gte('created_at', twentyFourHoursAgo);
  }

  const { data: recentDeliveries } = hasWebhooks ? await deliveriesQuery : { data: [] };
  const deliveries = (recentDeliveries || []) as unknown as WebhookDelivery[];

  // Fetch deliveries in last 24h for summary stats
  let stats24hQuery = supabase
    .from('webhook_deliveries')
    .select(`
      id,
      webhook_id,
      status,
      attempts,
      webhooks!inner(id, url, agent_id, is_active, failure_count, last_delivery_at)
    `)
    .gte('created_at', twentyFourHoursAgo);

  if (needsScope) {
    stats24hQuery = stats24hQuery.in('webhook_id', userWebhookIds);
  }

  const { data: last24hDeliveries } = hasWebhooks ? await stats24hQuery : { data: [] };

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
      <div style={{ padding: '28px 32px 60px' }}>
        {/* Header */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
          <div>
            <div className="row gap-2" style={{ marginBottom: 6 }}>
              <Link href="/webhooks" className="upper" style={{ color: 'var(--fg-4)', textDecoration: 'none' }}>
                Webhooks
              </Link>
              <span style={{ color: 'var(--fg-4)' }}>/</span>
              <p className="upper">Delivery Health</p>
            </div>
            <h1 className="h1">Webhook Health</h1>
            <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>Delivery status monitoring &amp; diagnostics</p>
          </div>
          <Link href="/webhooks" className="btn">
            <ArrowLeft size={14} />
            Webhooks
          </Link>
        </div>

        {/* Scope banner */}
        {isSuperAdmin ? (
          <div className="row gap-2" style={{
            marginBottom: 16,
            borderRadius: 6,
            background: 'var(--amber-bg)',
            border: '1px solid oklch(0.55 0.12 60 / 0.4)',
            padding: '10px 16px',
          }}>
            <Info size={14} style={{ color: 'var(--amber)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>
              Admin view — showing all platform webhook deliveries.
            </span>
          </div>
        ) : !hasWebhooks ? (
          <div className="row gap-2" style={{
            marginBottom: 16,
            borderRadius: 6,
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            padding: '10px 16px',
          }}>
            <Info size={14} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--fg-3)', fontWeight: 500 }}>
              No webhooks registered for your agents. Register a webhook to see delivery health here.
            </span>
          </div>
        ) : (
          <div className="row gap-2" style={{
            marginBottom: 16,
            borderRadius: 6,
            background: 'var(--peri-bg)',
            border: '1px solid oklch(0.50 0.08 265 / 0.4)',
            padding: '10px 16px',
          }}>
            <Info size={14} style={{ color: 'var(--peri)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--peri)', fontWeight: 500 }}>
              Showing deliveries for your webhooks only.
            </span>
          </div>
        )}

        {/* Overall Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <p className="upper" style={{ marginBottom: 8 }}>24h Total</p>
            <p className="num" style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg-0)' }}>{totalDeliveries24h}</p>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <p className="upper" style={{ marginBottom: 8, color: 'var(--mint)' }}>Success</p>
            <p className="num" style={{ fontSize: 24, fontWeight: 700, color: 'var(--mint)' }}>{totalSuccess}</p>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <p className="upper" style={{ marginBottom: 8, color: 'var(--rose)' }}>Failed</p>
            <p className="num" style={{ fontSize: 24, fontWeight: 700, color: 'var(--rose)' }}>{totalFailed}</p>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <p className="upper" style={{ marginBottom: 8, color: 'var(--peri)' }}>Retrying</p>
            <p className="num" style={{ fontSize: 24, fontWeight: 700, color: 'var(--peri)' }}>{totalRetrying}</p>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <p className="upper" style={{ marginBottom: 8 }}>Success Rate</p>
            <p className="num" style={{ fontSize: 24, fontWeight: 700, color: successRate >= 90 ? 'var(--mint)' : successRate >= 70 ? 'var(--amber)' : 'var(--rose)' }}>
              {successRate}%
            </p>
          </div>
        </div>

        {/* Per-Webhook Summary Cards (clickable for drill-down) */}
        {summaries.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div className="row gap-2" style={{ marginBottom: 16 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-3)' }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <h2 className="h3">Per-Webhook Summary</h2>
              <span className="dim" style={{ fontSize: 11 }}>(last 24h · click to filter failures)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
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
          <div style={{
            marginBottom: 16,
            borderRadius: 6,
            background: 'var(--peri-bg)',
            border: '1px solid oklch(0.50 0.08 265 / 0.4)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <p style={{ fontSize: 12, color: 'var(--peri)' }}>
              <span style={{ fontWeight: 600 }}>Filtered:</span> Showing failures for{' '}
              <span className="mono" style={{ color: 'var(--fg-1)' }}>{truncateUrl(filteredWebhookUrl || '', 60)}</span>
            </p>
            <Link href="/webhooks/health" className="btn btn--sm btn--ghost">
              Clear filter
            </Link>
          </div>
        )}

        {/* Recent Deliveries Table */}
        <div>
          <div className="row gap-2" style={{ marginBottom: 16 }}>
            <Clock size={14} style={{ color: 'var(--fg-3)' }} />
            <h2 className="h3">
              {filterWebhookId ? 'Failed Deliveries' : 'Recent Deliveries'}
            </h2>
            <span className="dim" style={{ fontSize: 11 }}>
              {filterWebhookId ? `(${deliveries.length} failures)` : '(last 50)'}
            </span>
          </div>

          {deliveries.length === 0 ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'var(--bg-2)',
                border: '1px solid var(--line-1)',
                marginBottom: 12,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-4)' }}>
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <p style={{ fontSize: 13, color: 'var(--fg-3)', fontWeight: 500 }}>
                {filterWebhookId ? 'No failures found' : 'No deliveries recorded'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 4 }}>
                {filterWebhookId
                  ? 'This webhook has no failed deliveries in the last 50 attempts.'
                  : 'Webhook deliveries will appear here once events are dispatched.'}
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line-1)' }}>
                      {['Event', 'Status', 'HTTP', 'Attempts', 'Webhook', 'Created', 'Delivered'].map(col => (
                        <th key={col} style={{ textAlign: 'left', padding: '10px 16px' }}>
                          <span className="upper" style={{ fontSize: 10 }}>{col}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d, idx) => (
                      <tr
                        key={d.id}
                        className="animate-fade-in"
                        style={{
                          borderBottom: '1px solid var(--line-1)',
                          animationDelay: `${0.15 + idx * 0.02}s`,
                        }}
                      >
                        <td style={{ padding: '10px 16px' }}>
                          <span className="pill pill--peri mono" style={{ fontSize: 11 }}>
                            {d.event}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {getStatusPill(d.status)}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {d.response_status ? (
                            <span className="mono num" style={{
                              fontSize: 12,
                              color: d.response_status >= 200 && d.response_status < 300
                                ? 'var(--mint)'
                                : d.response_status >= 400
                                  ? 'var(--rose)'
                                  : 'var(--amber)',
                            }}>
                              {d.response_status}
                            </span>
                          ) : (
                            <span className="dim" style={{ fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className="mono num" style={{ fontSize: 12, color: d.attempts > 1 ? 'var(--amber)' : 'var(--fg-3)' }}>
                            {d.attempts}/{d.max_retries}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--fg-3)' }} title={d.webhooks.url}>
                            {truncateUrl(d.webhooks.url)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className="num" style={{ fontSize: 12, color: 'var(--fg-3)' }} title={d.created_at}>
                            {formatTimestamp(d.created_at)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className="num" style={{ fontSize: 12, color: 'var(--fg-3)' }} title={d.delivered_at || undefined}>
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
          <div style={{
            marginTop: 16,
            borderRadius: 6,
            background: 'var(--amber-bg)',
            border: '1px solid oklch(0.55 0.12 60 / 0.35)',
            padding: '10px 16px',
          }}>
            <p style={{ fontSize: 12, color: 'var(--amber)' }}>
              <span style={{ fontWeight: 600 }}>{totalPending + totalRetrying}</span> deliveries pending or retrying in the last 24h.
            </p>
          </div>
        )}
      </div>
    </AutoRefresh>
  );
}
