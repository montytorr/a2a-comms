'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface WebhookFilterCardProps {
  webhookId: string;
  isActive: boolean;
  url: string;
  agentId: string;
  failureCount: number;
  lastDeliveryAt: string | null;
  successCount24h: number;
  failedCount24h: number;
  pendingCount24h: number;
  retryCount24h: number;
  totalCount24h: number;
  animationDelay: string;
}

function truncateUrl(url: string, maxLen = 50) {
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

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function WebhookFilterCard({
  webhookId,
  isActive,
  url,
  agentId,
  failureCount,
  lastDeliveryAt,
  successCount24h,
  failedCount24h,
  pendingCount24h,
  retryCount24h,
  totalCount24h,
  animationDelay,
}: WebhookFilterCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFilter = searchParams.get('webhook');
  const isSelected = activeFilter === webhookId;

  function handleClick() {
    if (isSelected) {
      router.push('/webhooks/health');
    } else {
      router.push(`/webhooks/health?webhook=${webhookId}`);
    }
  }

  const rate = totalCount24h > 0 ? Math.round((successCount24h / totalCount24h) * 100) : 0;

  return (
    <button
      onClick={handleClick}
      className="card animate-fade-in"
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '16px 20px',
        cursor: 'pointer',
        animationDelay,
        transition: 'all 0.15s ease',
        outline: isSelected ? `1px solid var(--peri)` : 'none',
        background: isSelected ? 'var(--peri-bg)' : 'var(--bg-1)',
      }}
      title={isSelected ? 'Click to clear filter' : 'Click to filter deliveries to this webhook'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row gap-2" style={{ marginBottom: 6 }}>
            <span className="dot" style={{ background: isActive ? 'var(--mint)' : 'var(--fg-4)' }} />
            <span className="mono" style={{ fontSize: 12, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url}>
              {truncateUrl(url, 50)}
            </span>
            {isSelected && (
              <span className="pill pill--peri" style={{ fontSize: 10, flexShrink: 0 }}>Filtered</span>
            )}
          </div>
          <div className="row gap-2" style={{ fontSize: 11, color: 'var(--fg-4)' }}>
            <span className="mono">{agentId.slice(0, 8)}...</span>
            {failureCount > 0 && (
              <span style={{ color: 'var(--rose)' }}>
                {failureCount} consecutive failure{failureCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
          <p className="num" style={{ fontSize: 18, fontWeight: 700, color: rate >= 90 ? 'var(--mint)' : rate >= 70 ? 'var(--amber)' : 'var(--rose)' }}>
            {rate}%
          </p>
          <p className="upper" style={{ fontSize: 10 }}>success</p>
        </div>
      </div>
      <div className="row gap-4" style={{ fontSize: 12 }}>
        <div className="row gap-1">
          <span className="dot dot--mint" />
          <span style={{ color: 'var(--fg-3)' }}>{successCount24h}</span>
        </div>
        <div className="row gap-1">
          <span className="dot dot--rose" />
          <span style={{ color: 'var(--fg-3)' }}>{failedCount24h}</span>
        </div>
        <div className="row gap-1">
          <span className="dot dot--amber" />
          <span style={{ color: 'var(--fg-3)' }}>{pendingCount24h}</span>
        </div>
        {retryCount24h > 0 && (
          <div className="row gap-1">
            <span className="dot dot--peri" />
            <span style={{ color: 'var(--fg-3)' }}>{retryCount24h}</span>
          </div>
        )}
        <span className="mono num dim" style={{ marginLeft: 'auto', fontSize: 11 }}>
          {lastDeliveryAt ? timeAgo(lastDeliveryAt) : 'never'}
        </span>
      </div>
      {/* Progress bar */}
      <div style={{
        marginTop: 12,
        height: 4,
        borderRadius: 2,
        background: 'var(--bg-3)',
        overflow: 'hidden',
        display: 'flex',
      }}>
        {successCount24h > 0 && (
          <div style={{
            height: '100%',
            background: 'var(--mint-2)',
            width: `${(successCount24h / totalCount24h) * 100}%`,
          }} />
        )}
        {pendingCount24h > 0 && (
          <div style={{
            height: '100%',
            background: 'var(--amber-2)',
            width: `${(pendingCount24h / totalCount24h) * 100}%`,
          }} />
        )}
        {retryCount24h > 0 && (
          <div style={{
            height: '100%',
            background: 'var(--peri)',
            width: `${(retryCount24h / totalCount24h) * 100}%`,
          }} />
        )}
        {failedCount24h > 0 && (
          <div style={{
            height: '100%',
            background: 'var(--rose)',
            width: `${(failedCount24h / totalCount24h) * 100}%`,
          }} />
        )}
      </div>
    </button>
  );
}
