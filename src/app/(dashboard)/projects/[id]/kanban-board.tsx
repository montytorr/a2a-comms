'use client';

import Link from 'next/link';
import type { TaskStatus, TaskPriority } from '@/lib/types';
import QuickTaskForm from './quick-task-form';
import { Avatar, EmptyState } from '@/components/atoms';
import { formatDate } from '@/lib/format-date';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import StatusBadge from '@/components/status-badge';
import styles from './project-detail.module.css';
import {
  BLOCKER_TONE,
  DEPENDENCY_KIND_TONE,
  DUE_STATE_TONE,
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

function renderDependencyPreview(items: Array<{ id: string; title: string; status: string }>, maxItems = 2) {
  return items.slice(0, maxItems).map((item) => item.title).join(', ');
}

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
                    <div
                      style={{
                        borderRadius: 'var(--radius-3)',
                        border: '1px dashed var(--line-1)',
                        background: 'var(--bg-0)',
                      }}
                    >
                      <EmptyState title="No tasks" />
                    </div>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                          {/* Top row: priority + labels + due */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                              <StatusBadge
                                status={task.priority}
                                label={prioLabel}
                                tone={prioTone}
                                dot="none"
                                size="lg"
                              />
                              {task.labels && task.labels.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
                                  {task.labels.slice(0, 3).map((label) => (
                                    <span
                                      key={label}
                                      className={`${pillClassForTone('neutral')} text-2xs`}
                                      style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                  {task.labels.length > 3 && (
                                    <span className={`${pillClassForTone('neutral')} text-2xs`}>
                                      +{task.labels.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {task.due_date && (
                                <span
                                  className={`${pillClassForTone(isOverdue ? 'rose' : 'neutral')} text-2xs`}
                                  style={{ fontFamily: 'var(--mono)' }}
                                >
                                  {compactDate(task.due_date)}
                                </span>
                              )}
                              {isOverdue && (
                                <span className={`${pillClassForTone('rose')} text-2xs`}>
                                  Overdue
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Title */}
                          <h4
                            className="text-sm" style={{
                              
                              fontWeight: 600,
                              lineHeight: 1.4,
                              color: 'var(--fg-1)',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              margin: 0,
                            }}
                          >
                            {task.title}
                          </h4>

                          {/* Dependency context */}
                          {hasDependencyContext && (
                            <div
                              className="card--inset"
                              style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
                            >
                              {blockerState && (
                                <div
                                  style={{
                                    borderRadius: 'var(--radius-2)',
                                    border: `1px solid ${lineVarForTone(BLOCKER_TONE[blockerState.tone])}`,
                                    background: surfaceVarForTone(BLOCKER_TONE[blockerState.tone]),
                                    padding: 10,
                                  }}
                                >
                                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                                    <span className={`${pillClassForTone(BLOCKER_TONE[blockerState.tone])} text-2xs`}>
                                      {blockerState.tone === 'stale'
                                        ? 'Stale blocker'
                                        : blockerState.tone === 'follow-through'
                                        ? 'Follow-up due'
                                        : 'Blocked'}
                                    </span>
                                    <span className={`${pillClassForTone('neutral')} text-2xs`}>
                                      {blockerState.statusLabel}
                                    </span>
                                    {blockerState.dueStateLabel && (
                                      <span className={`${pillClassForTone(DUE_STATE_TONE[blockerState.dueState])} text-2xs`}>
                                        {blockerState.dueStateLabel}
                                      </span>
                                    )}
                                  </div>
                                  <p className="upper text-2xs" style={{ marginTop: 8, color: 'var(--fg-4)' }}>
                                    Next unblock step
                                  </p>
                                  <p
                                    className="text-2xs" style={{
                                      marginTop: 4,
                                      
                                      lineHeight: 1.4,
                                      color: 'var(--fg-1)',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {blockerState.blockerResolutionAction || 'No unblock plan logged yet'}
                                  </p>
                                  <div
                                    className="text-2xs" style={{
                                      marginTop: 8,
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: 12,
                                      
                                      color: 'var(--fg-2)',
                                    }}
                                  >
                                    <span>
                                      <span style={{ color: 'var(--fg-4)' }}>Owner: </span>
                                      {blockerState.blockerResolutionOwner || 'Unassigned'}
                                    </span>
                                    <span>
                                      <span style={{ color: 'var(--fg-4)' }}>Follow-up: </span>
                                      {blockerState.blockerResolutionDueAt
                                        ? compactDate(blockerState.blockerResolutionDueAt)
                                        : 'Not scheduled'}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Dependency badges */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                                {activeDependencyGroups.map((group) => {
                                  const config = dependencyTypeConfig[group.key];
                                  return (
                                    <span
                                      key={group.key}
                                      className={`${pillClassForTone(config.tone)} text-2xs`}
                                    >
                                      {config.label} {group.items.length}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Dependency previews */}
                              <div
                                style={{
                                  display: 'grid',
                                  gap: 6,
                                  gridTemplateColumns: activeDependencyGroups.slice(0, 2).length > 1 ? '1fr 1fr' : '1fr',
                                }}
                              >
                                {activeDependencyGroups.slice(0, 2).map((group) => {
                                  const config = dependencyTypeConfig[group.key];
                                  const overflow = group.items.length - 2;
                                  return (
                                    <div
                                      key={group.key}
                                      style={{
                                        borderRadius: 'var(--radius-2)',
                                        border: '1px solid var(--line-1)',
                                        background: 'var(--bg-0)',
                                        padding: '8px 10px',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: 8,
                                          marginBottom: 2,
                                        }}
                                      >
                                        <span className="upper text-2xs" style={{ color: 'var(--fg-4)' }}>
                                          {config.previewLabel}
                                        </span>
                                        <span className="text-2xs" style={{ color: 'var(--fg-4)' }}>
                                          {group.items.length}
                                        </span>
                                      </div>
                                      <p
                                        className="text-2xs" style={{
                                          
                                          lineHeight: 1.4,
                                          color: 'var(--fg-2)',
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                        }}
                                      >
                                        {renderDependencyPreview(group.items)}
                                        {overflow > 0 ? ` +${overflow} more` : ''}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Footer: assignee + id */}
                          <div
                            style={{
                              marginTop: 'auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              borderTop: '1px solid var(--line-1)',
                              paddingTop: 10,
                            }}
                          >
                            {assigneeName ? (
                              <div
                                style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
                                title={assigneeName}
                              >
                                <Avatar name={assigneeName} size={20} />
                                <span
                                  className="text-2xs" style={{
                                    
                                    color: 'var(--fg-3)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {assigneeName}
                                </span>
                              </div>
                            ) : (
                              <span className="text-2xs" style={{ fontStyle: 'italic', color: 'var(--fg-4)' }}>
                                Unassigned
                              </span>
                            )}
                            <span
                              className="mono text-2xs"
                              style={{
                                
                                color: 'var(--fg-4)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.12em',
                              }}
                            >
                              #{task.id.slice(0, 6)}
                            </span>
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
