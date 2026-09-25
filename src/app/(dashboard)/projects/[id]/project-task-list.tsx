'use client';

import { useState } from 'react';
import type { TaskStatus } from '@/lib/types';
import TaskList, { type TaskListRow } from '@/components/task-list';
import QuickTaskForm from './quick-task-form';
import styles from './project-detail.module.css';

/* Kept so page.tsx's dependency-summary mapping still typechecks; the list
   itself only needs the fields TaskListRow names. */
export interface TaskRow extends TaskListRow {
  assignee_agent_id?: string | null;
  blocked_at?: string | null;
  blocker_follow_up_at?: string | null;
  blocker_followed_through_at?: string | null;
  blocker_escalated_at?: string | null;
  blocker_resolution_action?: string | null;
  blocker_resolution_owner?: string | null;
  blocker_resolution_due_at?: string | null;
  blocker_resolution_status?: string | null;
  dependencySummary?: {
    blockedBy?: Array<{ id: string; title: string; status: string }>;
    blocks?: Array<{ id: string; title: string; status: string }>;
    sequenceAfter?: Array<{ id: string; title: string; status: string }>;
    sequenceBefore?: Array<{ id: string; title: string; status: string }>;
    related?: Array<{ id: string; title: string; status: string }>;
  };
}

export default function ProjectTaskList({
  tasks,
  projectId,
  sprintId,
  members = [],
  canCreate,
}: {
  tasks: TaskRow[];
  projectId: string;
  sprintId?: string;
  members?: Array<{ id: string; role: string; agent: { id: string; name: string; display_name: string } | null }>;
  canCreate: boolean;
}) {
  const [creating, setCreating] = useState(false);

  /* "Blocked" on a row means blocked by work that is not finished. The board
     card carried a whole blocker panel for this, which is what made it tall. */
  const rows: TaskListRow[] = tasks.map((task) => ({
    ...task,
    blockedBy: (task.dependencySummary?.blockedBy || []).filter(
      (dep) => dep.status !== 'done' && dep.status !== 'cancelled'
    ).length,
  }));

  return (
    <>
      {/* Creating work does not depend on an empty group existing to host a
          button — a finished project has none. */}
      {canCreate && (
        <div className={styles.newTask}>
          {creating ? (
            <QuickTaskForm
              projectId={projectId}
              status="backlog"
              sprintId={sprintId}
              members={members}
              defaultOpen
              onClose={() => setCreating(false)}
            />
          ) : (
            <button type="button" className="btn btn--sm" onClick={() => setCreating(true)}>+ New task</button>
          )}
        </div>
      )}
      <TaskList
        tasks={rows}
        hrefFor={(row) => `/projects/${projectId}/tasks/${row.id}`}
        emptyHint="No tasks in this project yet."
        renderComposer={canCreate
          ? (status: TaskStatus, close: () => void) => (
              <QuickTaskForm
                projectId={projectId}
                status={status}
                sprintId={sprintId}
                members={members}
                defaultOpen
                onClose={close}
              />
            )
          : undefined}
      />
    </>
  );
}
