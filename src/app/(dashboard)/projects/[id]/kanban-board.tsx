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

const statusColors: Record<TaskStatus, { header: string; dot: string; glow: string }> = {
  backlog: { header: 'text-gray-500', dot: 'bg-gray-500', glow: '' },
  todo: { header: 'text-blue-400', dot: 'bg-blue-400', glow: 'shadow-[0_0_8px_rgba(59,130,246,0.15)]' },
  'in-progress': { header: 'text-cyan-400', dot: 'bg-cyan-400', glow: 'shadow-[0_0_8px_rgba(6,182,212,0.2)]' },
  'in-review': { header: 'text-amber-400', dot: 'bg-amber-400', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.15)]' },
  done: { header: 'text-emerald-400', dot: 'bg-emerald-400', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.15)]' },
  cancelled: { header: 'text-red-400', dot: 'bg-red-400', glow: '' },
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        {columns.map((col) => {
          const colTasks = tasksByStatus[col.id] || [];
          const sc = statusColors[col.id];

          return (
            <div key={col.id} className="min-w-0">
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${sc.dot} ${sc.glow}`} />
                  <span className={`text-[11px] font-semibold tracking-wide uppercase ${sc.header}`}>
                    {col.label}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-gray-600 bg-white/[0.03] px-1.5 py-0.5 rounded">
                  {colTasks.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {colTasks.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center">
                    <p className="text-[10px] text-gray-700">No tasks</p>
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
                      className="group block min-h-[280px] rounded-2xl glass-card-hover p-4"
                    >
                      <div className="flex h-full flex-col">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-[9px] font-bold tracking-[0.18em] uppercase ${pc.bg} ${pc.text}`}>
                            {pc.label}
                          </span>
                          {isOverdue && (
                            <span className="rounded-md bg-red-500/[0.1] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-red-400">
                              Overdue
                            </span>
                          )}
                        </div>

                        <h4 className="mb-3 min-h-[3.9rem] text-[13px] font-semibold leading-5 text-gray-200 transition-colors group-hover:text-white line-clamp-3">
                          {task.title}
                        </h4>

                        {task.labels && task.labels.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {task.labels.slice(0, 4).map((label) => (
                              <span
                                key={label}
                                className="rounded-full border border-violet-500/10 bg-violet-500/[0.08] px-2 py-0.5 text-[9px] font-medium text-violet-300"
                              >
                                {label}
                              </span>
                            ))}
                            {task.labels.length > 4 && (
                              <span className="px-1 text-[9px] text-gray-500">+{task.labels.length - 4}</span>
                            )}
                          </div>
                        )}

                        {hasDependencyContext && (
                          <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                                Dependency context
                              </span>
                              <span className="text-[9px] text-gray-600">
                                {activeDependencyGroups.length} lane{activeDependencyGroups.length === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="mb-3 flex flex-wrap gap-1.5">
                              {activeDependencyGroups.map((group) => {
                                const config = dependencyTypeConfig[group.key];
                                return (
                                  <span
                                    key={group.key}
                                    className={`inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-semibold ${config.tone}`}
                                  >
                                    {config.label} {group.items.length}
                                  </span>
                                );
                              })}
                            </div>

                            <div className="space-y-2">
                              {activeDependencyGroups.slice(0, 3).map((group) => {
                                const config = dependencyTypeConfig[group.key];
                                const overflow = group.items.length - 2;
                                return (
                                  <div
                                    key={group.key}
                                    className={`rounded-lg border-l-2 bg-black/10 px-2.5 py-2 ${config.previewTone}`}
                                  >
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                                        {config.label}
                                      </span>
                                      <span className="text-[9px] text-gray-600">{group.items.length}</span>
                                    </div>
                                    <p className="text-[11px] leading-4 line-clamp-2">
                                      {config.previewLabel} {renderDependencyPreview(group.items)}
                                      {overflow > 0 ? ` +${overflow} more` : ''}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.04] pt-3">
                          {assigneeName ? (
                            <div className="flex min-w-0 items-center gap-2" title={assigneeName}>
                              <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradients[getAvatarIndex(assigneeName)]} text-[9px] font-bold text-white`}>
                                {assigneeName[0]?.toUpperCase()}
                              </div>
                              <span className="truncate text-[10px] text-gray-400">{assigneeName}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] italic text-gray-600">Unassigned</span>
                          )}
                          {task.due_date && (
                            <span className={`text-[10px] font-mono tabular-nums ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                              {formatDate(task.due_date)}
                            </span>
                          )}
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
