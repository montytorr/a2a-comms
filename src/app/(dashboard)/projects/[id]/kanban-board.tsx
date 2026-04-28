'use client';

import Link from 'next/link';
import type { TaskStatus, TaskPriority } from '@/lib/types';
import QuickTaskForm from './quick-task-form';
import { formatDate } from '@/lib/format-date';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';

const columns: { id: TaskStatus; label: string }[] = [
  { id: 'backlog',     label: 'Backlog' },
  { id: 'todo',        label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'in-review',   label: 'In Review' },
  { id: 'done',        label: 'Done' },
  { id: 'cancelled',   label: 'Cancelled' },
];

// Map each status to design-system tokens
const statusMeta: Record<TaskStatus, {
  dotClass: string;
  headingColor: string;
  panelBg: string;
  countTone: string;
}> = {
  backlog:     { dotClass: 'dot',           headingColor: 'var(--fg-3)',  panelBg: 'var(--bg-1)', countTone: 'ghost' },
  todo:        { dotClass: 'dot dot--peri', headingColor: 'var(--peri)',  panelBg: 'var(--bg-1)', countTone: 'peri'  },
  'in-progress':{ dotClass: 'dot dot--amber pulse', headingColor: 'var(--amber)', panelBg: 'var(--amber-bg)', countTone: 'amber' },
  'in-review': { dotClass: 'dot dot--amber', headingColor: 'var(--amber)', panelBg: 'var(--bg-1)', countTone: 'amber' },
  done:        { dotClass: 'dot dot--mint', headingColor: 'var(--mint)',  panelBg: 'var(--mint-bg)', countTone: 'mint'  },
  cancelled:   { dotClass: 'dot dot--rose', headingColor: 'var(--rose)',  panelBg: 'var(--bg-1)', countTone: 'rose'  },
};

const priorityTone: Record<TaskPriority, string> = {
  urgent: 'rose',
  high:   'amber',
  medium: 'peri',
  low:    'ghost',
};

const priorityLabel: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

const avatarColors = [
  '#06b6d4', '#7c3aed', '#10b981', '#f97316', '#ec4899', '#f59e0b',
];

const dependencyTypeConfig = {
  blockedBy:     { label: 'Blocked by',  tone: 'rose',  previewLabel: 'Waiting on' },
  blocks:        { label: 'Blocking',    tone: 'amber', previewLabel: 'Blocking' },
  sequenceAfter: { label: 'After',       tone: 'peri',  previewLabel: 'Follows' },
  sequenceBefore:{ label: 'Before',      tone: 'peri',  previewLabel: 'Leads into' },
  related:       { label: 'Related',     tone: 'ghost', previewLabel: 'Related to' },
} as const;

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarColors.length;
}

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
    <div style={{ animationDelay: '0.1s' }}>
      <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 8 }}>
        <div style={{ display: 'flex', minWidth: 'max-content', alignItems: 'flex-start', gap: 16 }}>
          {columns.map((col) => {
            const colTasks = tasksByStatus[col.id] || [];
            const meta = statusMeta[col.id];

            return (
              <div
                key={col.id}
                style={{
                  width: 360,
                  minWidth: 360,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 720,
                  borderRadius: 20,
                  border: '1px solid var(--line-1)',
                  background: meta.panelBg,
                  padding: 10,
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    borderRadius: 14,
                    border: '1px solid var(--line-1)',
                    background: 'var(--bg-0)',
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className={meta.dotClass} />
                    <span
                      className="upper"
                      style={{ color: meta.headingColor, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {col.label}
                    </span>
                  </div>
                  <span className={`pill pill--${meta.countTone}`} style={{ fontSize: 9, fontFamily: 'var(--mono)' }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Task list */}
                <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                  {colTasks.length === 0 && (
                    <div
                      style={{
                        borderRadius: 16,
                        border: '1px dashed var(--line-1)',
                        background: 'var(--bg-0)',
                        padding: '24px 0',
                        textAlign: 'center',
                      }}
                    >
                      <p className="upper" style={{ fontSize: 10, color: 'var(--fg-4)' }}>No tasks</p>
                    </div>
                  )}

                  {colTasks.map((task) => {
                    const prioTone = priorityTone[task.priority as TaskPriority] || 'ghost';
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
                        style={{
                          display: 'block',
                          borderRadius: 20,
                          border: '1px solid var(--line-1)',
                          background: 'var(--bg-1)',
                          padding: 14,
                          textDecoration: 'none',
                          transition: 'transform 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--line-strong)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--line-1)';
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                          {/* Top row: priority + labels + due */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                              <span className={`pill pill--${prioTone}`} style={{ fontSize: 8 }}>
                                {prioLabel}
                              </span>
                              {task.labels && task.labels.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
                                  {task.labels.slice(0, 3).map((label) => (
                                    <span
                                      key={label}
                                      className="pill pill--peri"
                                      style={{ fontSize: 8, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                  {task.labels.length > 3 && (
                                    <span className="pill pill--ghost" style={{ fontSize: 8 }}>
                                      +{task.labels.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {task.due_date && (
                                <span
                                  className={isOverdue ? 'pill pill--rose' : 'pill pill--ghost'}
                                  style={{ fontSize: 8, fontFamily: 'var(--mono)' }}
                                >
                                  {compactDate(task.due_date)}
                                </span>
                              )}
                              {isOverdue && (
                                <span className="pill pill--rose" style={{ fontSize: 8 }}>
                                  Overdue
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Title */}
                          <h4
                            style={{
                              fontSize: 14,
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
                                    borderRadius: 10,
                                    border: '1px solid var(--rose-bg)',
                                    background: 'var(--rose-bg)',
                                    padding: 10,
                                  }}
                                >
                                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                                    <span
                                      className={`pill pill--${blockerState.tone === 'stale' ? 'rose' : blockerState.tone === 'follow-through' ? 'amber' : 'rose'}`}
                                      style={{ fontSize: 8 }}
                                    >
                                      {blockerState.tone === 'stale'
                                        ? 'Stale blocker'
                                        : blockerState.tone === 'follow-through'
                                        ? 'Follow-up due'
                                        : 'Blocked'}
                                    </span>
                                    <span className="pill pill--ghost" style={{ fontSize: 8 }}>
                                      {blockerState.statusLabel}
                                    </span>
                                    {blockerState.dueStateLabel && (
                                      <span
                                        className={`pill pill--${blockerState.dueState === 'overdue' ? 'rose' : blockerState.dueState === 'due-soon' ? 'amber' : 'mint'}`}
                                        style={{ fontSize: 8 }}
                                      >
                                        {blockerState.dueStateLabel}
                                      </span>
                                    )}
                                  </div>
                                  <p className="upper" style={{ fontSize: 9, marginTop: 8, color: 'var(--fg-4)' }}>
                                    Next unblock step
                                  </p>
                                  <p
                                    style={{
                                      marginTop: 4,
                                      fontSize: 11,
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
                                    style={{
                                      marginTop: 8,
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: 12,
                                      fontSize: 10,
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
                                      className={`pill pill--${config.tone}`}
                                      style={{ fontSize: 8 }}
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
                                        borderRadius: 10,
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
                                        <span className="upper" style={{ fontSize: 8, color: 'var(--fg-4)' }}>
                                          {config.previewLabel}
                                        </span>
                                        <span style={{ fontSize: 8, color: 'var(--fg-4)' }}>
                                          {group.items.length}
                                        </span>
                                      </div>
                                      <p
                                        style={{
                                          fontSize: 10,
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
                                <div
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    background: avatarColors[getAvatarIndex(assigneeName)],
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    fontWeight: 700,
                                    color: '#fff',
                                    flexShrink: 0,
                                  }}
                                >
                                  {assigneeName[0]?.toUpperCase()}
                                </div>
                                <span
                                  style={{
                                    fontSize: 9,
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
                              <span style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--fg-4)' }}>
                                Unassigned
                              </span>
                            )}
                            <span
                              className="mono"
                              style={{
                                fontSize: 8,
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
                  <QuickTaskForm
                    projectId={projectId}
                    status={col.id}
                    sprintId={sprintId}
                    members={members}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
