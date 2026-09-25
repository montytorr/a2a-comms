'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { TaskStatus } from '@/lib/types';
import { Avatar } from '@/components/atoms';
import { formatDate } from '@/lib/format-date';
import { colorVarForTone, statusTone, taskPriorityTone } from '@/lib/status-tone';
import styles from './task-list.module.css';

export interface TaskListRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  labels?: string[] | null;
  assignee?: { id: string; name: string; display_name: string } | null;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
  project?: { id: string; title: string } | null;
  /** Set when the task is blocked by work that is not done. */
  blockedBy?: number;
}

/* The workflow order the kanban columns encoded. The list keeps it; losing it
   would turn "where is this in the flow" into a sort question. */
const GROUPS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'in-review', label: 'In Review' },
  { id: 'done', label: 'Done' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_BARS: Record<string, number> = { urgent: 3, high: 3, medium: 2, low: 1 };

function timestamp(value?: string) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

/* Unstarted work reads newest-first; everything else by last touch, which is
   what "what moved" means once a task is in flight. */
function sortGroup(rows: TaskListRow[], status: string) {
  const sorted = [...rows];
  const key = status === 'backlog' || status === 'todo' ? 'created_at' : 'updated_at';
  sorted.sort((a, b) => timestamp(b[key]) - timestamp(a[key]));
  return sorted;
}

function PriorityGlyph({ priority }: { priority: string }) {
  const bars = PRIORITY_BARS[priority] ?? 1;
  const tone = taskPriorityTone(priority);
  return (
    <span className={styles.priority} style={{ color: colorVarForTone(tone) }} title={`${priority} priority`}>
      {[1, 2, 3].map((n) => (
        <i key={n} className={n > bars ? styles.priorityDim : undefined} />
      ))}
    </span>
  );
}

function TaskRow({ row, href }: { row: TaskListRow; href: string }) {
  const tone = statusTone('task', row.status);
  const isOverdue = !!row.due_date && new Date(row.due_date) < new Date() && row.status !== 'done' && row.status !== 'cancelled';
  const assigneeName = row.assignee?.display_name || row.assignee?.name;

  return (
    <Link href={href} className={styles.row}>
      <PriorityGlyph priority={row.priority} />
      <span className={styles.ref}>#{row.id.slice(0, 6)}</span>
      <span className={styles.titleCell}>
        <span className={styles.statusDot} style={{ background: colorVarForTone(tone) }} aria-hidden="true" />
        <span className={styles.title}>{row.title}</span>
      </span>
      <span className={styles.meta}>
        {row.blockedBy ? <span className={styles.blocked}>blocked</span> : null}
        {row.labels && row.labels.length > 0 && (
          <span className={`${styles.labels} text-2xs`}>
            {row.labels.slice(0, 2).map((label) => (
              <span key={label} className="pill text-2xs">{label}</span>
            ))}
          </span>
        )}
        {row.due_date && (
          <span className={`${styles.metaText} ${isOverdue ? styles.overdue : ''}`}>{formatDate(row.due_date)}</span>
        )}
        {row.project && <span className={styles.metaText}>{row.project.title}</span>}
        {assigneeName ? <Avatar name={assigneeName} size={18} /> : <span className={styles.metaText}>—</span>}
      </span>
    </Link>
  );
}

export default function TaskList({
  tasks,
  hrefFor,
  renderComposer,
  emptyHint = 'No tasks',
}: {
  tasks: TaskListRow[];
  hrefFor: (row: TaskListRow) => string;
  /** Rendered inside a group when the caller can create tasks there. The
   *  second argument closes the group's composer again. */
  renderComposer?: (status: TaskStatus, close: () => void) => React.ReactNode;
  emptyHint?: string;
}) {
  const [openComposer, setOpenComposer] = useState<TaskStatus | null>(null);

  /* Only groups that have something in them. Six headers over nothing was
     the board's problem wearing a different hat; creating work is the
     caller's composer, not an empty group kept alive to host a button. */
  const grouped = GROUPS.map((group) => ({
    ...group,
    rows: sortGroup(tasks.filter((t) => t.status === group.id), group.id),
  })).filter((group) => group.rows.length > 0 || openComposer === group.id);

  if (grouped.length === 0) {
    return <div className={`card ${styles.list}`}><p className={styles.empty}>{emptyHint}</p></div>;
  }

  return (
    <div className={`card ${styles.list}`}>
      {grouped.map((group) => {
        const tone = statusTone('task', group.id);
        return (
          <section key={group.id} className={styles.group} aria-label={group.label}>
            <div className={styles.groupHead}>
              <span className={styles.statusDot} style={{ background: colorVarForTone(tone) }} aria-hidden="true" />
              <span className={styles.groupLabel}>{group.label}</span>
              <span className={styles.groupCount}>{group.rows.length}</span>
              {renderComposer && (
                <button
                  type="button"
                  className={styles.groupAdd}
                  onClick={() => setOpenComposer((c) => (c === group.id ? null : group.id))}
                  aria-expanded={openComposer === group.id}
                >
                  + Add
                </button>
              )}
            </div>
            {group.rows.map((row) => <TaskRow key={row.id} row={row} href={hrefFor(row)} />)}
            {renderComposer && openComposer === group.id && (
              <div className={styles.composer}>{renderComposer(group.id, () => setOpenComposer(null))}</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
