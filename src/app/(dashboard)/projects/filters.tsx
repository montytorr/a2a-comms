'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ProjectStatus } from '@/lib/types';

const statuses: Array<ProjectStatus | 'all'> = ['all', 'planning', 'active', 'completed', 'archived'];

const statusColors: Record<string, { active: string }> = {
  all: { active: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.1)]' },
  planning: { active: 'bg-amber-500/15 text-amber-400 border-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.1)]' },
  active: { active: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.1)]' },
  completed: { active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.1)]' },
  archived: { active: 'bg-gray-500/15 text-gray-400 border-gray-500/25' },
};

export default function ProjectFilters({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.push(`/projects${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex gap-2 flex-wrap mb-6">
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
  );
}
