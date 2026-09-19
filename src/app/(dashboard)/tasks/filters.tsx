'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Every option here must be a status a task can actually hold. `Blocked` was
 * offered and could never match: `tasks.status` has never permitted it. The two
 * that do exist, `backlog` and `in-review`, were the ones missing.
 *
 * A task IS shown as blocked elsewhere, but that is derived from its
 * dependencies rather than stored on the row, so it is not a filter value.
 */
const statuses = [
  { value: 'open', label: 'Open' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'in-review', label: 'In review' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'Any status' },
];

const scopes = [
  { value: 'me', label: 'Assigned to me' },
  { value: 'all', label: 'Everyone' },
];

interface TaskFiltersProps {
  projects: Array<{ id: string; title: string }>;
}

export default function TaskFilters({ projects }: TaskFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // 'open' and 'me' are the defaults, so they stay out of the URL — a
      // shared link then carries only what was deliberately changed.
      if (!value || value === 'open' || (key === 'assignee' && value === 'me') || value === 'any') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.push(`/tasks${qs ? `?${qs}` : ''}`);
    },
    [router, searchParams],
  );

  return (
    <div className="row gap-2" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
      <select
        className="cp-select text-sm"
        style={{ width: 'auto', minWidth: '9rem' }}
        aria-label="Filter by status"
        value={searchParams.get('status') || 'open'}
        onChange={(e) => update('status', e.target.value)}
      >
        {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <select
        className="cp-select text-sm"
        style={{ width: 'auto', minWidth: '10rem' }}
        aria-label="Filter by assignee"
        value={searchParams.get('assignee') || 'me'}
        onChange={(e) => update('assignee', e.target.value)}
      >
        {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <select
        className="cp-select text-sm"
        style={{ width: 'auto', minWidth: '11rem', maxWidth: '18rem' }}
        aria-label="Filter by project"
        value={searchParams.get('project') || 'any'}
        onChange={(e) => update('project', e.target.value)}
      >
        <option value="any">All projects</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
    </div>
  );
}
