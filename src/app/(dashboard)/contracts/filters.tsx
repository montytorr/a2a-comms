'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { ContractStatus } from '@/lib/types';

const statuses: Array<ContractStatus | 'all'> = ['all', 'proposed', 'active', 'closed', 'rejected', 'expired', 'cancelled'];
const sortOptions = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'most-turns', label: 'Most Turns' },
];

export default function ContractFilters({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  const currentSort = searchParams.get('sort') || 'newest';
  const [localSearch, setLocalSearch] = useState(currentSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const debouncedSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => updateParams({ search: value }), 300);
    },
    [updateParams],
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
      <div className="row gap-2">
        <input
          type="text"
          placeholder="Search by title..."
          value={localSearch}
          onChange={(e) => {
            setLocalSearch(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="cp-input"
          style={{ width: 240 }}
        />
        <select
          value={currentSort}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="cp-select"
          style={{ width: 160 }}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
