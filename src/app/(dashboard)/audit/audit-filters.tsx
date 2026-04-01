'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const actionTypes = [
  { value: 'all', label: 'All Actions' },
  { value: 'contract.propose', label: 'Propose Contract' },
  { value: 'contract.accept', label: 'Accept Contract' },
  { value: 'contract.reject', label: 'Reject Contract' },
  { value: 'contract.close', label: 'Close Contract' },
  { value: 'message.send', label: 'Send Message' },
  { value: 'kill_switch.activate', label: 'Kill Switch Activate' },
  { value: 'kill_switch.deactivate', label: 'Kill Switch Deactivate' },
  // Security events
  { value: 'security', label: '🔒 Security Events' },
  { value: 'auth.success', label: 'Auth Success' },
  { value: 'auth.failure', label: 'Auth Failure' },
  { value: 'authz.denied', label: 'Authorization Denied' },
  { value: 'webhook.delivery.success', label: 'Webhook Delivery OK' },
  { value: 'webhook.delivery.failure', label: 'Webhook Delivery Failed' },
  { value: 'webhook.disabled', label: 'Webhook Disabled' },
  { value: 'suspicious.replay_detected', label: 'Replay Detected' },
  { value: 'suspicious.invalid_signature', label: 'Invalid Signature' },
  { value: 'policy.kill_switch.activated', label: 'Kill Switch Activated' },
  { value: 'policy.kill_switch.deactivated', label: 'Kill Switch Deactivated' },
];

const dateRanges = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
];

const selectClasses =
  'bg-[#0a0a14] border border-white/[0.06] rounded-xl px-3 py-2 text-[12px] text-gray-300 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200 appearance-none cursor-pointer hover:border-white/[0.1]';

const inputClasses =
  'bg-[#0a0a14] border border-white/[0.06] rounded-xl px-3 py-2 text-[12px] text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200 hover:border-white/[0.1]';

export default function AuditFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const actor = searchParams.get('actor') || '';
  const action = searchParams.get('action') || 'all';
  const dateRange = searchParams.get('range') || 'all';

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      // Reset to page 1 when filters change
      params.delete('page');
      const qs = params.toString();
      router.push(`/audit${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  const hasFilters = actor || action !== 'all' || dateRange !== 'all';

  const clearAll = useCallback(() => {
    router.push('/audit');
  }, [router]);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Actor search */}
      <input
        type="text"
        placeholder="Filter by actor..."
        value={actor}
        onChange={(e) => updateFilter('actor', e.target.value)}
        className={`${inputClasses} w-44`}
      />

      {/* Action type */}
      <select
        value={action}
        onChange={(e) => updateFilter('action', e.target.value)}
        className={selectClasses}
      >
        {actionTypes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Date range */}
      <select
        value={dateRange}
        onChange={(e) => updateFilter('range', e.target.value)}
        className={selectClasses}
      >
        {dateRanges.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      {/* Clear button */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="text-[10px] font-semibold text-gray-600 hover:text-gray-400 transition-colors uppercase tracking-wider"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
