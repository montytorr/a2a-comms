'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ContractStatus } from '@/lib/types';

const statuses: Array<ContractStatus | 'all'> = ['all', 'proposed', 'active', 'closed', 'rejected', 'expired', 'cancelled'];

const statusColors: Record<string, { active: string; inactive: string }> = {
  all: { active: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.1)]', inactive: '' },
  proposed: { active: 'bg-amber-500/15 text-amber-400 border-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.1)]', inactive: '' },
  active: { active: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.1)]', inactive: '' },
  closed: { active: 'bg-gray-500/15 text-gray-400 border-gray-500/25', inactive: '' },
  rejected: { active: 'bg-red-500/15 text-red-400 border-red-500/25 shadow-[0_0_12px_rgba(239,68,68,0.1)]', inactive: '' },
  expired: { active: 'bg-orange-500/15 text-orange-400 border-orange-500/25', inactive: '' },
  cancelled: { active: 'bg-gray-500/15 text-gray-500 border-gray-500/25', inactive: '' },
};

const sortOptions = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'most-turns', label: 'Most Turns' },
];

const selectClasses =
  'bg-[#0a0a14] border border-white/[0.06] rounded-xl px-3 py-1.5 text-[11px] text-gray-300 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200 appearance-none cursor-pointer hover:border-white/[0.1]';

const inputClasses =
  'bg-[#0a0a14] border border-white/[0.06] rounded-xl px-3 py-1.5 text-[11px] text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200 hover:border-white/[0.1]';

export default function ContractFilters({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  const currentSort = searchParams.get('sort') || 'newest';

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value || value === 'all' || (key === 'sort' && value === 'newest')) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.push(`/contracts${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-4 mb-6">
      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((status) => {
          const isActive = current === status;
          const colors = statusColors[status] || statusColors.all;
          return (
            <button
              key={status}
              onClick={() => updateParams({ status })}
              className={`px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wider uppercase transition-all duration-300 border ${
                isActive
                  ? colors.active
                  : 'text-gray-600 border-white/[0.04] hover:text-gray-400 hover:border-white/[0.08] hover:bg-white/[0.02]'
              }`}
            >
              {status}
            </button>
          );
        })}
      </div>

      {/* Search + sort row */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by title..."
          defaultValue={currentSearch}
          onChange={(e) => updateParams({ search: e.target.value })}
          className={`${inputClasses} w-52`}
        />
        <select
          value={currentSort}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className={selectClasses}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
