'use client';

import Link from 'next/link';
import type { TaskStatus, TaskPriority } from '@/lib/types';
import QuickTaskForm from './quick-task-form';
import { formatDate } from '@/lib/format-date';

const columns: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'in-review', label: 'In Review' },
  { id: 'done', label: 'Done' },
  { id: 'cancelled', label: 'Cancelled' },
];

const statusColors: Record<TaskStatus, { header: string; dot: string; glow: string; panel: string; count: string }> = {
  backlog: {
    header: 'text-gray-400',
    dot: 'bg-gray-400',
    glow: '',
    panel: 'from-white/[0.03] via-white/[0.018] to-white/[0.01]',
    count: 'border-white/[0.07] bg-white/[0.04] text-gray-400',
  },
  todo: {
    header: 'text-blue-300',
    dot: 'bg-blue-400',
    glow: 'shadow-[0_0_10px_rgba(59,130,246,0.18)]',
    panel: 'from-blue-500/[0.07] via-white/[0.02] to-white/[0.01]',
    count: 'border-blue-400/15 bg-blue-500/[0.08] text-blue-200',
  },
  'in-progress': {
    header: 'text-cyan-300',
    dot: 'bg-cyan-400',
    glow: 'shadow-[0_0_10px_rgba(6,182,212,0.22)]',
    panel: 'from-cyan-500/[0.08] via-white/[0.02] to-white/[0.01]',
    count: 'border-cyan-400/15 bg-cyan-500/[0.08] text-cyan-200',
  },
  'in-review': {
    header: 'text-amber-300',
    dot: 'bg-amber-400',
    glow: 'shadow-[0_0_10px_rgba(245,158,11,0.18)]',
    panel: 'from-amber-500/[0.07] via-white/[0.02] to-white/[0.01]',
    count: 'border-amber-400/15 bg-amber-500/[0.08] text-amber-200',
  },
  done: {
    header: 'text-emerald-300',
    dot: 'bg-emerald-400',
    glow: 'shadow-[0_0_10px_rgba(16,185,129,0.18)]',
    panel: 'from-emerald-500/[0.07] via-white/[0.02] to-white/[0.01]',
    count: 'border-emerald-400/15 bg-emerald-500/[0.08] text-emerald-200',
  },
  cancelled: {
    header: 'text-red-300',
    dot: 'bg-red-400',
    glow: '',
    panel: 'from-red-500/[0.06] via-white/[0.02] to-white/[0.01]',
    count: 'border-red-400/15 bg-red-500/[0.08] text-red-200',
  },
};

const priorityConfig: Record<TaskPriority, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-red-500/[0.1]', text: 'text-red-400', label: 'Urgent' },
  high: { bg: 'bg-orange-500/[0.1]', text: 'text-orange-400', label: 'High' },
  medium: { bg: 'bg-blue-500/[0.08]', text: 'text-blue-400', label: 'Medium' },
  low: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', label: 'Low' },
};

const avatarGradients = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

const dependencyTypeConfig = {
  blockedBy: {
    label: 'Blocked by',
    tone: 'border-red-500/20 bg-red-500/[0.08] text-red-300',
    previewTone: 'border-l-red-400/50 text-gray-300',
    previewLabel: 'Waiting on',
  },
  blocks: {
    label: 'Blocking',
    tone: 'border-amber-500/20 bg-amber-500/[0.08] text-amber-300',
    previewTone: 'border-l-amber-400/50 text-gray-300',
    previewLabel: 'Blocking',
  },
  sequenceAfter: {
    label: 'After',
    tone: 'border-indigo-500/20 bg-indigo-500/[0.08] text-indigo-300',
    previewTone: 'border-l-indigo-400/50 text-gray-300',
    previewLabel: 'Follows',
  },
  sequenceBefore: {
    label: 'Before',
    tone: 'border-sky-500/20 bg-sky-500/[0.08] text-sky-300',
    previewTone: 'border-l-sky-400/50 text-gray-300',
    previewLabel: 'Leads into',
  },
  related: {
    label: 'Related',
    tone: 'border-violet-500/20 bg-violet-500/[0.08] text-violet-300',
    previewTone: 'border-l-violet-400/50 text-gray-300',
    previewLabel: 'Related to',
  },
} as const;

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarGradients.length;
}

function renderDependencyPreview(items: Array<{ id: string; title: string; status: string }>, maxItems = 2) {
  return items.slice(0, maxItems).map((item) => item.title).join(', ');
}

function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
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

export default function KanbanBoard({ tasks, projectId, sprintId, members = [] }: KanbanBoardProps) {
  const tasksByStatus = columns.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.status === col.id);
    return acc;
  }, {} as Record<string, TaskRow[]>);

  return (
    <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {columns.map((col) => {
          const colTasks = tasksByStatus[col.id] || [];
          const sc = statusColors[col.id];

          return (
            <div key={col.id} className={`min-w-0 rounded-[22px] border border-white/[0.06] bg-gradient-to-b ${sc.panel} p-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.26)] ring-1 ring-inset ring-white/[0.02] lg:h-[720px] lg:max-h-[720px] flex flex-col`}>
              <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-white/[0.05] bg-black/20 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${sc.dot} ${sc.glow}`} />
                  <span className={`truncate text-[10px] font-semibold uppercase tracking-[0.16em] ${sc.header}`}>
                    {col.label}
                  </span>
                </div>
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${sc.count}`}>
                  {colTasks.length}
                </span>
              </div>

              <div className="space-y-2.5 overflow-y-auto pr-1 lg:flex-1 lg:min-h-0">
                {colTasks.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/[0.07] bg-black/10 py-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-600">No tasks</p>
                  </div>
                )}
                {colTasks.map((task) => {
                  const pc = priorityConfig[task.priority as TaskPriority] || priorityConfig.medium;
                  const assigneeName = task.assignee?.display_name || task.assignee?.name;
                  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                  const dependencySummary = task.dependencySummary;
                  const dependencyGroups = [
                    { key: 'blockedBy', items: dependencySummary?.blockedBy || [] },
                    { key: 'blocks', items: dependencySummary?.blocks || [] },
                    { key: 'sequenceAfter', items: dependencySummary?.sequenceAfter || [] },
                    { key: 'sequenceBefore', items: dependencySummary?.sequenceBefore || [] },
                    { key: 'related', items: dependencySummary?.related || [] },
                  ] as const;
                  const activeDependencyGroups = dependencyGroups.filter((group) => group.items.length > 0);
                  const hasDependencyContext = activeDependencyGroups.length > 0;

                  return (
                    <Link
                      key={task.id}
                      href={`/projects/${projectId}/tasks/${task.id}`}
                      className="group block rounded-[24px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.028)_42%,rgba(255,255,255,0.01))] p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/[0.03] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-[linear-gradient(145deg,rgba(255,255,255,0.1),rgba(255,255,255,0.038)_42%,rgba(255,255,255,0.015))] hover:shadow-[0_20px_48px_rgba(0,0,0,0.34)]"
                    >
                      <div className="flex h-full flex-col gap-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-[8px] font-bold uppercase tracking-[0.18em] ${pc.bg} ${pc.text}`}>
                              {pc.label}
                            </span>
                            {task.labels && task.labels.length > 0 && (
                              <div className="flex min-w-0 flex-wrap gap-1">
                                {task.labels.slice(0, 3).map((label) => (
                                  <span
                                    key={label}
                                    className="max-w-full truncate rounded-full border border-violet-400/15 bg-violet-500/[0.09] px-2 py-0.5 text-[8px] font-medium uppercase tracking-[0.08em] text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                                  >
                                    {label}
                                  </span>
                                ))}
                                {task.labels.length > 3 && (
                                  <span className="rounded-full border border-white/[0.07] bg-white/[0.05] px-1.5 py-0.5 text-[8px] font-medium text-gray-400">
                                    +{task.labels.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {task.due_date && (
                              <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-mono tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${isOverdue ? 'border-red-500/20 bg-red-500/[0.08] text-red-300' : 'border-white/[0.07] bg-white/[0.05] text-gray-400'}`}>
                                {compactDate(task.due_date)}
                              </span>
                            )}
                            {isOverdue && (
                              <span className="rounded-md border border-red-500/20 bg-red-500/[0.12] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                Overdue
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="text-[14px] font-semibold leading-5 text-gray-100 transition-colors group-hover:text-white line-clamp-3 [text-wrap:balance]">
                          {task.title}
                        </h4>

                        {hasDependencyContext && (
                          <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-black/20 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                            <div className="flex flex-wrap items-center gap-1">
                              {activeDependencyGroups.map((group) => {
                                const config = dependencyTypeConfig[group.key];
                                return (
                                  <span
                                    key={group.key}
                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[8px] font-semibold ${config.tone}`}
                                  >
                                    {config.label} {group.items.length}
                                  </span>
                                );
                              })}
                            </div>

                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {activeDependencyGroups.slice(0, 2).map((group) => {
                                const config = dependencyTypeConfig[group.key];
                                const overflow = group.items.length - 2;
                                return (
                                  <div
                                    key={group.key}
                                    className={`rounded-xl border border-white/[0.05] border-l-2 bg-black/15 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${config.previewTone}`}
                                  >
                                    <div className="mb-0.5 flex items-center justify-between gap-2">
                                      <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                                        {config.previewLabel}
                                      </span>
                                      <span className="text-[8px] text-gray-500">{group.items.length}</span>
                                    </div>
                                    <p className="text-[10px] leading-4 text-gray-200 line-clamp-2">
                                      {renderDependencyPreview(group.items)}
                                      {overflow > 0 ? ` +${overflow} more` : ''}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
                          {assigneeName ? (
                            <div className="flex min-w-0 items-center gap-2" title={assigneeName}>
                              <div className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradients[getAvatarIndex(assigneeName)]} text-[8px] font-bold text-white`}>
                                {assigneeName[0]?.toUpperCase()}
                              </div>
                              <span className="truncate text-[9px] text-gray-300">{assigneeName}</span>
                            </div>
                          ) : (
                            <span className="text-[9px] italic text-gray-500">Unassigned</span>
                          )}
                          <span className="text-[8px] font-mono uppercase tracking-[0.12em] text-gray-500">
                            #{task.id.slice(0, 6)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                <QuickTaskForm projectId={projectId} status={col.id} sprintId={sprintId} members={members} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
