'use client';

import Link from 'next/link';
import type { TaskStatus, TaskPriority } from '@/lib/types';
import QuickTaskForm from './quick-task-form';
import { Avatar } from '@/components/atoms';
import { formatDate } from '@/lib/format-date';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import styles from './project-detail.module.css';
import {
  BLOCKER_TONE,
  DEPENDENCY_KIND_TONE,
  colorVarForTone,
  dotClassForTone,
  lineVarForTone,
  pillClassForTone,
  statusTone,
  surfaceVarForTone,
  taskPriorityTone,
  tonePulses,
  type DependencyKind,
  type Tone,
} from '@/lib/status-tone';

const columns: { id: TaskStatus; label: string }[] = [
  { id: 'backlog',     label: 'Backlog' },
  { id: 'todo',        label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'in-review',   label: 'In Review' },
  { id: 'done',        label: 'Done' },
  { id: 'cancelled',   label: 'Cancelled' },
];

const priorityLabel: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

/* Labels are this board's own (it has less room than the task page); the tones
   come from DEPENDENCY_KIND_TONE so the two views cannot disagree, which they
   did — `related` was grey here and mint on the task page. */
const dependencyTypeConfig: Record<DependencyKind, { label: string; tone: Tone; previewLabel: string }> = {
  blockedBy:     { label: 'Blocked by', tone: DEPENDENCY_KIND_TONE.blockedBy,      previewLabel: 'Waiting on' },
  blocks:        { label: 'Blocking',   tone: DEPENDENCY_KIND_TONE.blocks,         previewLabel: 'Blocking' },
  sequenceAfter: { label: 'After',      tone: DEPENDENCY_KIND_TONE.sequenceAfter,  previewLabel: 'Follows' },
  sequenceBefore:{ label: 'Before',     tone: DEPENDENCY_KIND_TONE.sequenceBefore, previewLabel: 'Leads into' },
  related:       { label: 'Related',    tone: DEPENDENCY_KIND_TONE.related,        previewLabel: 'Related to' },
};


function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  labels: string[];
  assignee_agent_id?: string | null;
  assignee?: { id: string; name: string; display_name: string } | null;
  due_date: string | null;
  created_at?: string;
  updated_at?: string;
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

interface KanbanBoardProps {
  tasks: TaskRow[];
  projectId: string;
  sprintId?: string;
  members?: Array<{
    id: string;
    role: string;
    agent: { id: string; name: string; display_name: string } | null;
  }>;
}

function timestampOrZero(value?: string) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function sortTasksForColumn(tasks: TaskRow[], status: TaskStatus) {
  const sorted = [...tasks];
  if (status === 'backlog' || status === 'todo') {
    sorted.sort((a, b) => timestampOrZero(b.created_at) - timestampOrZero(a.created_at));
    return sorted;
  }
  sorted.sort((a, b) => timestampOrZero(b.updated_at) - timestampOrZero(a.updated_at));
  return sorted;
}

export default function KanbanBoard({ tasks, projectId, sprintId, members = [] }: KanbanBoardProps) {
  const tasksByStatus = columns.reduce((acc, col) => {
    acc[col.id] = sortTasksForColumn(tasks.filter((t) => t.status === col.id), col.id);
    return acc;
  }, {} as Record<string, TaskRow[]>);

  return (
    <div>
      <div className={styles.boardScroller}>
        <div className={styles.boardRow}>
          {columns.map((col) => {
            const colTasks = tasksByStatus[col.id] || [];
            const colTone = statusTone('task', col.id);

            return (
              <div key={col.id} className={styles.column}>
                {/* Column header */}
                <div className={styles.columnHead}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className={`${dotClassForTone(colTone)}${tonePulses(colTone) ? ' pulse' : ''}`} />
                    <span
                      className="upper text-2xs"
                      style={{ color: colorVarForTone(colTone), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {col.label}
                    </span>
                  </div>
                  <span className={`${pillClassForTone(colTone)} text-2xs`} style={{ fontFamily: 'var(--mono)' }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Creating a task is the column's primary action, so it sits
                    at the top. It used to be the last child of an inner
                    720px scroller, which put it under the fold of a box most
                    people never realised could scroll. */}
                <QuickTaskForm
                  projectId={projectId}
                  status={col.id}
                  sprintId={sprintId}
                  members={members}
                />

                {/* Task list */}
                <div className={styles.columnList}>
                  {colTasks.length === 0 && (
                    <p className={styles.columnEmpty}>No tasks</p>
                  )}

                  {colTasks.map((task) => {
                    const prioTone = taskPriorityTone(task.priority);
                    const prioLabel = priorityLabel[task.priority as TaskPriority] || task.priority;
                    const assigneeName = task.assignee?.display_name || task.assignee?.name;
                    const isOverdue =
                      task.due_date &&
                      new Date(task.due_date) < new Date() &&
                      task.status !== 'done';
                    const dependencySummary = task.dependencySummary;
                    const dependencyGroups = [
                      { key: 'blockedBy' as const,      items: dependencySummary?.blockedBy || [] },
                      { key: 'blocks' as const,         items: dependencySummary?.blocks || [] },
                      { key: 'sequenceAfter' as const,  items: dependencySummary?.sequenceAfter || [] },
                      { key: 'sequenceBefore' as const, items: dependencySummary?.sequenceBefore || [] },
                      { key: 'related' as const,        items: dependencySummary?.related || [] },
                    ];
                    const activeDependencyGroups = dependencyGroups.filter((g) => g.items.length > 0);
                    const hasDependencyContext = activeDependencyGroups.length > 0;
                    const blockerState = dependencySummary?.blockedBy?.length
                      ? getBlockedTaskNotificationState({
                          updatedAt: task.updated_at || task.created_at || new Date().toISOString(),
                          blockedAt: task.blocked_at,
                          blockerFollowUpAt: task.blocker_follow_up_at,
                          blockerFollowedThroughAt: task.blocker_followed_through_at,
                          blockerEscalatedAt: task.blocker_escalated_at,
                          blockerResolutionAction: task.blocker_resolution_action,
                          blockerResolutionOwner: task.blocker_resolution_owner,
                          blockerResolutionDueAt: task.blocker_resolution_due_at,
                          blockerResolutionStatus: task.blocker_resolution_status,
                          blockedByCount: dependencySummary.blockedBy.length,
                          blockingTaskTitles: dependencySummary.blockedBy.map((item) => item.title),
                        })
                      : null;

                    return (
                      <Link
                        key={task.id}
                        href={`/projects/${projectId}/tasks/${task.id}`}
                        className={styles.taskCard}
                      >
                        <div className={styles.taskBody}>
                          {/* Title first: it is the only thing anyone scans a
                              board for. Priority rides along as a dot. */}
                          <div className={styles.taskTitleRow}>
                            <span
                              className={styles.taskPriority}
                              style={{ background: colorVarForTone(prioTone) }}
                              title={`${prioLabel} priority`}
                              aria-label={`${prioLabel} priority`}
                            />
                            <h4 className={styles.taskTitle}>{task.title}</h4>
                          </div>

                          {task.labels && task.labels.length > 0 && (
                            <div className={styles.taskLabels}>
                              {task.labels.slice(0, 2).map((label) => (
                                <span key={label} className={`${pillClassForTone('neutral')} text-2xs`}>{label}</span>
                              ))}
                              {task.labels.length > 2 && (
                                <span className={`${pillClassForTone('neutral')} text-2xs`}>+{task.labels.length - 2}</span>
                              )}
                            </div>
                          )}

                          {blockerState && (
                            <div className={styles.taskMetaLine}>
                              <span
                                className={styles.taskBlocked}
                                style={{
                                  border: `1px solid ${lineVarForTone(BLOCKER_TONE[blockerState.tone])}`,
                                  background: surfaceVarForTone(BLOCKER_TONE[blockerState.tone]),
                                  color: colorVarForTone(BLOCKER_TONE[blockerState.tone]),
                                }}
                              >
                                {blockerState.tone === 'stale'
                                  ? 'Stale blocker'
                                  : blockerState.tone === 'follow-through'
                                  ? 'Follow-up due'
                                  : 'Blocked'}
                              </span>
                              <span className={styles.taskBlockedNote}>
                                {blockerState.blockerResolutionOwner || 'no owner'}
                                {blockerState.blockerResolutionDueAt ? ` · ${compactDate(blockerState.blockerResolutionDueAt)}` : ''}
                              </span>
                            </div>
                          )}

                          {/* Counts only. The titles they used to preview are
                              on the task page, which is one click away. */}
                          {hasDependencyContext && (
                            <div className={styles.taskMetaLine}>
                              {activeDependencyGroups.map((group, index) => (
                                <span key={group.key}>
                                  {index > 0 && <span aria-hidden="true">· </span>}
                                  <b>{group.items.length}</b> {dependencyTypeConfig[group.key].label.toLowerCase()}
                                </span>
                              ))}
                            </div>
                          )}

                          {(task.due_date || isOverdue) && (
                            <div className={styles.taskMetaLine}>
                              {task.due_date && (
                                <span className={`${pillClassForTone(isOverdue ? 'rose' : 'neutral')} text-2xs`} style={{ fontFamily: 'var(--mono)' }}>
                                  {compactDate(task.due_date)}
                                </span>
                              )}
                              {isOverdue && <span className={`${pillClassForTone('rose')} text-2xs`}>Overdue</span>}
                            </div>
                          )}

                          <div className={styles.taskFooter}>
                            {assigneeName ? (
                              <span className={styles.taskAssignee} title={assigneeName}>
                                <Avatar name={assigneeName} size={20} />
                                <span>{assigneeName}</span>
                              </span>
                            ) : (
                              <span className={styles.taskUnassigned}>Unassigned</span>
                            )}
                            <span className={`mono ${styles.taskId}`}>#{task.id.slice(0, 6)}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
