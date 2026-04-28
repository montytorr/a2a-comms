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
    <div className="row" style={{ flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
      {/* Agent filter */}
      <select
        value={agent}
        onChange={(e) => updateFilter('agent', e.target.value)}
        className="cp-select"
        style={{ width: 'auto', minWidth: '140px' }}
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
        className="cp-select"
        style={{ width: 'auto', minWidth: '120px' }}
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
        className="cp-input"
        style={{ width: '200px' }}
      />

      {/* Clear button */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="btn btn--ghost btn--sm"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
