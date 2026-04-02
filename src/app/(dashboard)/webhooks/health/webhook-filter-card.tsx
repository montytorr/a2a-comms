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
  totalCount24h,
  animationDelay,
}: WebhookFilterCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFilter = searchParams.get('webhook');
  const isSelected = activeFilter === webhookId;

  function handleClick() {
    if (isSelected) {
      // Clicking again clears filter
      router.push('/webhooks/health');
    } else {
      router.push(`/webhooks/health?webhook=${webhookId}`);
    }
  }

  const rate = totalCount24h > 0 ? Math.round((successCount24h / totalCount24h) * 100) : 0;

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-2xl glass-card px-5 py-4 animate-fade-in transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'ring-1 ring-cyan-500/40 bg-cyan-500/[0.04]'
          : 'hover:bg-white/[0.02]'
      }`}
      style={{ animationDelay }}
      title={isSelected ? 'Click to clear filter' : 'Click to filter deliveries to this webhook'}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            <span className="text-[11px] font-mono text-gray-400 truncate" title={url}>
              {truncateUrl(url, 50)}
            </span>
            {isSelected && (
              <span className="text-[9px] font-semibold text-cyan-400 bg-cyan-500/[0.1] px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                Filtered
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            <span className="font-mono">{agentId.slice(0, 8)}...</span>
            {failureCount > 0 && (
              <span className="text-red-400/70">
                {failureCount} consecutive failure{failureCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="text-right ml-4 shrink-0">
          <p className={`text-lg font-bold tabular-nums ${rate >= 90 ? 'text-emerald-400' : rate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
            {rate}%
          </p>
          <p className="text-[9px] text-gray-600 uppercase tracking-wider">success</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-gray-500">{successCount24h}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-gray-500">{failedCount24h}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-gray-500">{pendingCount24h}</span>
        </div>
        <span className="ml-auto text-[10px] text-gray-700 font-mono">
          {lastDeliveryAt ? timeAgo(lastDeliveryAt) : 'never'}
        </span>
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1 rounded-full bg-white/[0.04] overflow-hidden flex">
        {successCount24h > 0 && (
          <div
            className="h-full bg-emerald-500/60 rounded-l-full"
            style={{ width: `${(successCount24h / totalCount24h) * 100}%` }}
          />
        )}
        {pendingCount24h > 0 && (
          <div
            className="h-full bg-amber-500/60"
            style={{ width: `${(pendingCount24h / totalCount24h) * 100}%` }}
          />
        )}
        {failedCount24h > 0 && (
          <div
            className="h-full bg-red-500/60 rounded-r-full"
            style={{ width: `${(failedCount24h / totalCount24h) * 100}%` }}
          />
        )}
      </div>
    </button>
  );
}
