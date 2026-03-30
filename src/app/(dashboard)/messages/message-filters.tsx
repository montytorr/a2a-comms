'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const messageTypes = [
  { value: 'all', label: 'All Types' },
  { value: 'message', label: 'Message' },
  { value: 'request', label: 'Request' },
  { value: 'response', label: 'Response' },
  { value: 'update', label: 'Update' },
  { value: 'status', label: 'Status' },
];

const selectClasses =
  'bg-[#0a0a14] border border-white/[0.06] rounded-xl px-3 py-2 text-[12px] text-gray-300 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200 appearance-none cursor-pointer hover:border-white/[0.1]';

const inputClasses =
  'bg-[#0a0a14] border border-white/[0.06] rounded-xl px-3 py-2 text-[12px] text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200 hover:border-white/[0.1]';

interface MessageFiltersProps {
  agents: Array<{ id: string; name: string; display_name: string }>;
}

export default function MessageFilters({ agents }: MessageFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const agent = searchParams.get('agent') || 'all';
  const type = searchParams.get('type') || 'all';
  const search = searchParams.get('search') || '';

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.push(`/messages${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  const hasFilters = agent !== 'all' || type !== 'all' || search !== '';

  const clearAll = useCallback(() => {
    router.push('/messages');
  }, [router]);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Agent filter */}
      <select
        value={agent}
        onChange={(e) => updateFilter('agent', e.target.value)}
        className={selectClasses}
      >
        <option value="all">All Agents</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.display_name || a.name}
          </option>
        ))}
      </select>

      {/* Message type */}
      <select
        value={type}
        onChange={(e) => updateFilter('type', e.target.value)}
        className={selectClasses}
      >
        {messageTypes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Content search */}
      <input
        type="text"
        placeholder="Search content..."
        value={search}
        onChange={(e) => updateFilter('search', e.target.value)}
        className={`${inputClasses} w-52`}
      />

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
