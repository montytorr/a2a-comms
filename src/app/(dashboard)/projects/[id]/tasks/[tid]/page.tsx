import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect, notFound } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import { formatDate, formatDateTime } from '@/lib/format-date';
import TaskStatusDropdown from './task-status-dropdown';
import {
  EditableTitle,
  EditableDescription,
  AssigneePicker,
  LabelsEditor,
  DueDatePicker,
  PriorityPicker,
  SprintPicker,
  DeleteTaskButton,
} from './task-editor';
import TaskComments from './task-comments';
import BlockerActions from './blocker-actions';
import type { TaskStatus, TaskPriority } from '@/lib/types';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
export const dynamic = 'force-dynamic';

const statusConfig: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  backlog: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', dot: 'bg-gray-500' },
  todo: { bg: 'bg-blue-500/[0.08]', text: 'text-blue-400', dot: 'bg-blue-400' },
  'in-progress': { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  'in-review': { bg: 'bg-amber-500/[0.08]', text: 'text-amber-400', dot: 'bg-amber-400' },
  done: { bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  cancelled: { bg: 'bg-red-500/[0.08]', text: 'text-red-400', dot: 'bg-red-400' },
};

const priorityConfig: Record<TaskPriority, { bg: string; text: string; icon: string }> = {
  urgent: { bg: 'bg-red-500/[0.1]', text: 'text-red-400', icon: '🔴' },
  high: { bg: 'bg-orange-500/[0.1]', text: 'text-orange-400', icon: '🟠' },
  medium: { bg: 'bg-blue-500/[0.08]', text: 'text-blue-400', icon: '🔵' },
  low: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', icon: '⚪' },
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; tid: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { id: projectId, tid } = await params;
  const supabase = createServerClient();
  noStore();

  // Fetch task
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*, blocked_at, blocker_follow_up_at, blocker_followed_through_at, blocker_escalated_at')
    .eq('id', tid)
    .eq('project_id', projectId)
    .single();

  if (error || !task) notFound();

  // Verify access
  if (!user.isSuperAdmin) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);

    if (!membership || membership.length === 0) redirect('/projects');
  }

  // Fetch related data in parallel
  const [
    projectRes, assigneeRes, reporterRes, sprintRes,
    blockedByRes, blocksRes, contractsRes,
    membersRes, sprintsRes, commentsRes,
  ] = await Promise.all([
    supabase.from('projects').select('id, title').eq('id', projectId).single(),
    task.assignee_agent_id
      ? supabase.from('agents').select('id, name, display_name').eq('id', task.assignee_agent_id).single()
      : Promise.resolve({ data: null }),
    task.reporter_agent_id
      ? supabase.from('agents').select('id, name, display_name').eq('id', task.reporter_agent_id).single()
      : Promise.resolve({ data: null }),
    task.sprint_id
      ? supabase.from('sprints').select('id, title, status').eq('id', task.sprint_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('task_dependencies')
      .select('id, blocking_task_id, tasks!task_dependencies_blocking_task_id_fkey(id, title, status, project_id)')
      .eq('blocked_task_id', tid),
    supabase
      .from('task_dependencies')
      .select('id, blocked_task_id, tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id)')
      .eq('blocking_task_id', tid),
    supabase
      .from('task_contracts')
      .select('id, contract:contracts(id, title, status)')
      .eq('task_id', tid),
    supabase
      .from('project_members')
      .select('id, role, agent:agents(id, name, display_name)')
      .eq('project_id', projectId),
    supabase
      .from('sprints')
      .select('id, title, status')
      .eq('project_id', projectId)
      .order('position', { ascending: true }),
    supabase
      .from('task_comments')
      .select('*, author:agents!task_comments_author_agent_id_fkey(id, name, display_name)')
      .eq('task_id', tid)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const project = projectRes.data;
  const _assignee = assigneeRes.data;
  const reporter = reporterRes.data;
  const _sprint = sprintRes.data;
  const members = membersRes.data || [];
  const sprints = sprintsRes.data || [];

  interface TaskDep {
    id: string;
    blocking_task_id?: string;
    blocked_task_id?: string;
    tasks: { id: string; title: string; status: string; project_id: string } | null;
  }
  interface LinkedContract {
    id: string;
    contract: { id: string; title: string; status: string } | null;
  }
  const blockedBy = ((blockedByRes.data || []) as unknown as TaskDep[]).filter(
    (dep) => dep.tasks?.project_id === projectId
  );
  const blocks = ((blocksRes.data || []) as unknown as TaskDep[]).filter(
    (dep) => dep.tasks?.project_id === projectId
  );
  const linkedContracts = (contractsRes.data || []) as unknown as LinkedContract[];

  // Filter linked contracts by participation unless superAdmin
  let visibleContracts = linkedContracts;
  if (!user.isSuperAdmin && linkedContracts.length > 0) {
    const contractIds = linkedContracts.map((lc) => lc.contract?.id).filter(Boolean) as string[];
    if (contractIds.length > 0) {
      const { data: visibleParts } = await supabase
        .from('contract_participants')
        .select('contract_id')
        .in('contract_id', contractIds)
        .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000']);
      const visibleIds = new Set((visibleParts || []).map((p) => p.contract_id));
      visibleContracts = linkedContracts.filter((lc) => lc.contract && visibleIds.has(lc.contract.id));
    } else {
      visibleContracts = [];
    }
  }

  const comments = (commentsRes.data || []) as Array<{
    id: string;
    content: string;
    comment_type: string;
    author_name: string | null;
    author_agent_id: string | null;
    author?: { id: string; name: string; display_name: string } | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;

  const _pc = priorityConfig[task.priority as TaskPriority] || priorityConfig.medium;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const blockerState = blockedBy.length > 0
    ? getBlockedTaskNotificationState({
        updatedAt: task.updated_at,
        blockedAt: task.blocked_at,
        blockerFollowUpAt: task.blocker_follow_up_at,
        blockerFollowedThroughAt: task.blocker_followed_through_at,
        blockerEscalatedAt: task.blocker_escalated_at,
        blockedByCount: blockedBy.length,
        blockingTaskTitles: blockedBy.map((dep) => dep.tasks?.title || '').filter(Boolean),
      })
    : null;

  return (
    <AutoRefresh intervalMs={15000}>
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 animate-fade-in">
        <Link href="/projects" className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">Projects</Link>
        <span className="text-gray-700 text-[10px]">›</span>
        <Link href={`/projects/${projectId}`} className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">
          {project?.title || 'Project'}
        </Link>
        <span className="text-gray-700 text-[10px]">›</span>
        <span className="text-[11px] text-gray-400">Task</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title + Status */}
          <div className="animate-fade-in">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1">
                <EditableTitle value={task.title} projectId={projectId} taskId={tid} />
                <div className="flex items-center gap-3 flex-wrap">
                  <TaskStatusDropdown projectId={projectId} taskId={tid} currentStatus={task.status} />
                  <PriorityPicker value={task.priority} projectId={projectId} taskId={tid} />
                  {isOverdue && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold text-red-400 bg-red-500/[0.1] border border-red-500/20">
                      ⚠ Overdue
                    </span>
                  )}
                  {blockerState && (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${blockerState.tone === 'stale' ? 'text-red-300 bg-red-500/[0.12] border-red-500/25' : blockerState.tone === 'follow-through' ? 'text-amber-300 bg-amber-500/[0.1] border-amber-500/20' : 'text-rose-300 bg-rose-500/[0.08] border-rose-500/20'}`}>
                      {blockerState.tone === 'stale' ? 'Blocked · stale escalation' : blockerState.tone === 'follow-through' ? 'Blocked · follow-through due' : 'Blocked'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.05s' }}>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-3">Description</p>
            <EditableDescription value={task.description} projectId={projectId} taskId={tid} />
          </div>

          {/* Dependencies */}
          {(blockedBy.length > 0 || blocks.length > 0) && (
            <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Dependencies</p>
                  {blockerState && <p className="text-[12px] text-gray-400 mt-2">{blockerState.meta}</p>}
                </div>
                {blockerState && (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold border ${blockerState.tone === 'stale' ? 'text-red-300 bg-red-500/[0.12] border-red-500/25' : blockerState.tone === 'follow-through' ? 'text-amber-300 bg-amber-500/[0.1] border-amber-500/20' : 'text-rose-300 bg-rose-500/[0.08] border-rose-500/20'}`}>
                    {blockerState.tone === 'stale' ? 'Escalate now' : blockerState.tone === 'follow-through' ? 'Follow through now' : 'Tracked blocker'}
                  </span>
                )}
              </div>

              {blockerState && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-[11px]">
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Blocked since</p>
                      <p className="text-gray-300">{formatDateTime(blockerState.blockedSince)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Last follow-up</p>
                      <p className="text-gray-300">{blockerState.blockerFollowedThroughAt ? formatDateTime(blockerState.blockerFollowedThroughAt) : 'None logged'}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Escalation</p>
                      <p className="text-gray-300">{blockerState.blockerEscalatedAt ? formatDateTime(blockerState.blockerEscalatedAt) : 'Not escalated'}</p>
                    </div>
                  </div>
                  <BlockerActions projectId={projectId} taskId={tid} canEscalate={blockerState.stale} />
                </>
              )}

              {blockedBy.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-medium text-red-400/80 mb-2">Blocked by</p>
                  <div className="space-y-1.5">
                    {blockedBy.map((dep) => {
                      const t = dep.tasks;
                      if (!t) return null;
                      const dsc = statusConfig[t.status as TaskStatus] || statusConfig.backlog;
                      return (
                        <Link
                          key={dep.id}
                          href={`/projects/${t.project_id}/tasks/${t.id}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dsc.dot}`} />
                          <span className="text-[12px] text-gray-300 hover:text-cyan-400 transition-colors">{t.title}</span>
                          <span className={`text-[9px] font-semibold uppercase ${dsc.text} ml-auto`}>{t.status}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {blocks.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-amber-400/80 mb-2">Blocks</p>
                  <div className="space-y-1.5">
                    {blocks.map((dep) => {
                      const t = dep.tasks;
                      if (!t) return null;
                      const dsc = statusConfig[t.status as TaskStatus] || statusConfig.backlog;
                      return (
                        <Link
                          key={dep.id}
                          href={`/projects/${t.project_id}/tasks/${t.id}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dsc.dot}`} />
                          <span className="text-[12px] text-gray-300 hover:text-cyan-400 transition-colors">{t.title}</span>
                          <span className={`text-[9px] font-semibold uppercase ${dsc.text} ml-auto`}>{t.status}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linked Contracts */}
          {visibleContracts.length > 0 && (
            <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Linked Contracts</p>
              <div className="space-y-1.5">
                {visibleContracts.map((lc) => {
                  const c = lc.contract;
                  if (!c) return null;
                  return (
                    <Link
                      key={lc.id}
                      href={`/contracts/${c.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400/60">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <span className="text-[12px] text-gray-300 hover:text-cyan-400 transition-colors">{c.title}</span>
                      <span className="text-[9px] font-semibold uppercase text-gray-500 ml-auto">{c.status}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <TaskComments comments={comments} projectId={projectId} taskId={tid} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details Card */}
          <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.05s' }}>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Details</p>

            <div className="space-y-4">
              {/* Assignee */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Assignee</p>
                <AssigneePicker
                  currentId={task.assignee_agent_id}
                  members={members as unknown as Array<{ agent: { id: string; name: string; display_name: string } | null }>}
                  projectId={projectId}
                  taskId={tid}
                />
              </div>

              {/* Reporter */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Reporter</p>
                {reporter ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-gray-300 font-medium">{reporter.display_name || reporter.name}</span>
                  </div>
                ) : (
                  <span className="text-[12px] text-gray-600 italic">Unknown</span>
                )}
              </div>

              {/* Sprint */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Sprint</p>
                <SprintPicker
                  currentSprintId={task.sprint_id}
                  sprints={sprints}
                  projectId={projectId}
                  taskId={tid}
                />
              </div>

              {/* Priority */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Priority</p>
                <PriorityPicker value={task.priority} projectId={projectId} taskId={tid} />
              </div>

              {/* Due Date */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Due Date</p>
                <DueDatePicker
                  value={task.due_date}
                  projectId={projectId}
                  taskId={tid}
                  isOverdue={!!isOverdue}
                />
              </div>

              {/* Labels */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-2">Labels</p>
                <LabelsEditor
                  labels={task.labels || []}
                  projectId={projectId}
                  taskId={tid}
                />
              </div>

              {/* Created */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Created</p>
                <span className="text-[11px] text-gray-500 font-mono tabular-nums">
                  {formatDate(task.created_at)}
                </span>
              </div>

              {/* Updated */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Last Updated</p>
                <span className="text-[11px] text-gray-500 font-mono tabular-nums">
                  {formatDateTime(task.updated_at)}
                </span>
              </div>
            </div>

            {/* Delete Task */}
            <DeleteTaskButton projectId={projectId} taskId={tid} />
          </div>
        </div>
      </div>
    </div>
    </AutoRefresh>
  );
}
