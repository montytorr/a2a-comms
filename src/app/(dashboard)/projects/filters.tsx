'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ProjectStatus } from '@/lib/types';

const statuses: Array<ProjectStatus | 'all'> = ['all', 'planning', 'active', 'completed', 'archived'];
const inboxOptions = ['all', 'needs-response', 'history'] as const;

export default function ProjectFilters({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentInbox = searchParams.get('inbox') || 'all';

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
    <div className="col gap-3" style={{ marginBottom: 16 }}>
      <div className="seg">
        {statuses.map((status) => (
          <button
            key={status}
            className={current === status ? 'active' : ''}
            onClick={() => updateParams({ status })}
          >
            {status === 'all' ? 'All' : status[0].toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>
      <div className="seg">
        {inboxOptions.map((option) => (
          <button
            key={option}
            className={currentInbox === option ? 'active' : ''}
            onClick={() => updateParams({ inbox: option })}
          >
            {option === 'needs-response' ? 'Needs Response' : option === 'all' ? 'Open Workflow' : 'History'}
          </button>
        ))}
      </div>
    </div>
  );
}
