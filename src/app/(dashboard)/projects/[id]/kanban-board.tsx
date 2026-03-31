'use client';

import Link from 'next/link';
import type { TaskStatus, TaskPriority } from '@/lib/types';
import QuickTaskForm from './quick-task-form';

const columns: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'in-review', label: 'In Review' },
  { id: 'done', label: 'Done' },
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

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarGradients.length;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  labels: string[];
  assignee: { id: string; name: string; display_name: string } | null;
  due_date: string | null;
}

interface KanbanBoardProps {
  tasks: TaskRow[];
  projectId: string;
  sprintId?: string;
}

export default function KanbanBoard({ tasks, projectId, sprintId }: KanbanBoardProps) {
  const tasksByStatus = columns.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.status === col.id);
    return acc;
  }, {} as Record<string, TaskRow[]>);

  return (
    <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

                    return (
                      <Link
                        key={task.id}
                        href={`/projects/${projectId}/tasks/${task.id}`}
                        className="block rounded-xl glass-card-hover p-3 group"
                      >
                        {/* Priority Badge */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pc.bg} ${pc.text}`}>
                            {pc.label}
                          </span>
                          {isOverdue && (
                            <span className="text-[9px] font-bold text-red-400 bg-red-500/[0.1] px-1.5 py-0.5 rounded">
                              Overdue
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h4 className="text-[12px] font-medium text-gray-300 group-hover:text-white transition-colors leading-snug mb-2 line-clamp-2">
                          {task.title}
                        </h4>

                        {/* Labels */}
                        {task.labels && task.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {task.labels.slice(0, 3).map((label) => (
                              <span
                                key={label}
                                className="text-[9px] font-medium text-violet-400 bg-violet-500/[0.08] px-1.5 py-0.5 rounded-full border border-violet-500/10"
                              >
                                {label}
                              </span>
                            ))}
                            {task.labels.length > 3 && (
                              <span className="text-[9px] text-gray-600">+{task.labels.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Footer: assignee + due date */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.03]">
                          {assigneeName ? (
                            <div className="flex items-center gap-1.5" title={assigneeName}>
                              <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${avatarGradients[getAvatarIndex(assigneeName)]} flex items-center justify-center text-[8px] font-bold text-white`}>
                                {assigneeName[0]?.toUpperCase()}
                              </div>
                              <span className="text-[10px] text-gray-500 truncate max-w-[80px]">{assigneeName}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-700 italic">Unassigned</span>
                          )}
                          {task.due_date && (
                            <span className={`text-[9px] font-mono tabular-nums ${isOverdue ? 'text-red-400' : 'text-gray-600'}`}>
                              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                <QuickTaskForm projectId={projectId} status={col.id} sprintId={sprintId} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
