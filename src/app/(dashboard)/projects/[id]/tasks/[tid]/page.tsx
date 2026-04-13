import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
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
import ExecutionPanel from './execution-panel';
import AttachmentList from '@/components/attachment-list';
import AttachmentUpload from './attachment-upload';
import type { TaskStatus, TaskPriority, TaskExecutionRun, TaskExecutionCheckpoint, TaskAttachment, TaskActivityEvent } from '@/lib/types';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import { listAttachmentsForScope } from '@/lib/attachment-access';
import { listTaskActivityEvents } from '@/lib/task-activity';
export const dynamic = 'force-dynamic';

const dependencySectionStyles = {
  blockedBy: {
    label: 'Blocked by',
    accent: 'text-red-400/80',
    pill: 'text-red-300 bg-red-500/[0.08] border-red-500/20',
    card: 'border-red-500/10 bg-red-500/[0.03]',
  },
  blocks: {
    label: 'Blocks',
    accent: 'text-amber-400/80',
    pill: 'text-amber-300 bg-amber-500/[0.08] border-amber-500/20',
    card: 'border-amber-500/10 bg-amber-500/[0.03]',
  },
  sequenceAfter: {
    label: 'Sequence after',
    accent: 'text-indigo-300/80',
    pill: 'text-indigo-200 bg-indigo-500/[0.08] border-indigo-500/20',
    card: 'border-indigo-500/10 bg-indigo-500/[0.03]',
  },
  sequenceBefore: {
    label: 'Sequence before',
    accent: 'text-sky-300/80',
    pill: 'text-sky-200 bg-sky-500/[0.08] border-sky-500/20',
    card: 'border-sky-500/10 bg-sky-500/[0.03]',
  },
  related: {
    label: 'Related tasks',
    accent: 'text-violet-300/80',
    pill: 'text-violet-200 bg-violet-500/[0.08] border-violet-500/20',
    card: 'border-violet-500/10 bg-violet-500/[0.03]',
  },
} as const;

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
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const { id: projectId, tid } = await params;
  const supabase = createServerClient();
  noStore();

  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', tid)
    .eq('project_id', projectId)
    .single();

  if (error || !task) notFound();

  const agentScope = auth.agentScope;

  let hasReadOnlyObserverAccess = false;
  if (!user.isSuperAdmin) {
    const [{ data: membership }, { data: observerAccess }, { data: invitationAccess }] = await Promise.all([
      supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .in('agent_id', agentScope)
        .limit(1),
      supabase
        .from('project_observers')
        .select('id')
        .eq('project_id', projectId)
        .in('agent_id', agentScope)
        .limit(1),
      supabase
        .from('project_member_invitations')
        .select('id')
        .eq('project_id', projectId)
        .in('agent_id', agentScope)
        .limit(1),
    ]);

    hasReadOnlyObserverAccess = !!observerAccess && observerAccess.length > 0;

    if ((!membership || membership.length === 0) && !hasReadOnlyObserverAccess && (!invitationAccess || invitationAccess.length === 0)) {
      redirect('/projects');
    }
  }

  const [
    projectRes, assigneeRes, reporterRes, sprintRes,
    blockedByRes, blocksRes, contractsRes,
    membersRes, sprintsRes, commentsRes,
    executionRunsRes, executionCheckpointsRes, attachmentsRes, activityRes,
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
      .select('id, blocking_task_id, dependency_type, tasks!task_dependencies_blocking_task_id_fkey(id, title, status, project_id)')
      .eq('blocked_task_id', tid),
    supabase
      .from('task_dependencies')
      .select('id, blocked_task_id, dependency_type, tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id)')
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
    supabase
      .from('task_execution_runs')
      .select('*')
      .eq('task_id', tid)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('task_execution_checkpoints')
      .select('*')
      .eq('task_id', tid)
      .order('created_at', { ascending: false })
      .limit(5),
    listAttachmentsForScope({
      projectId,
      taskId: tid,
      includeSignedUrl: true,
    }),
    listTaskActivityEvents(tid).catch(() => []),
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
  const blockedBy = ((blockedByRes.data || []) as unknown as Array<TaskDep & { dependency_type?: string }>).filter(
    (dep) => dep.tasks?.project_id === projectId && dep.dependency_type === 'blocks'
  );
  const blocks = ((blocksRes.data || []) as unknown as Array<TaskDep & { dependency_type?: string }>).filter(
    (dep) => dep.tasks?.project_id === projectId && dep.dependency_type === 'blocks'
  );
  const sequenceAfter = ((blockedByRes.data || []) as unknown as Array<TaskDep & { dependency_type?: string }>).filter(
    (dep) => dep.tasks?.project_id === projectId && dep.dependency_type === 'sequence_after'
  );
  const sequenceBefore = ((blocksRes.data || []) as unknown as Array<TaskDep & { dependency_type?: string }>).filter(
    (dep) => dep.tasks?.project_id === projectId && dep.dependency_type === 'sequence_after'
  );
  const relatedTasks = [
    ...((blockedByRes.data || []) as unknown as Array<TaskDep & { dependency_type?: string }>).filter(
      (dep) => dep.tasks?.project_id === projectId && dep.dependency_type === 'relates_to'
    ),
    ...((blocksRes.data || []) as unknown as Array<TaskDep & { dependency_type?: string }>).filter(
      (dep) => dep.tasks?.project_id === projectId && dep.dependency_type === 'relates_to'
    ),
  ];
  const linkedContracts = (contractsRes.data || []) as unknown as LinkedContract[];
  const dependencySections = [
    { key: 'blockedBy', config: dependencySectionStyles.blockedBy, items: blockedBy },
    { key: 'blocks', config: dependencySectionStyles.blocks, items: blocks },
    { key: 'sequenceAfter', config: dependencySectionStyles.sequenceAfter, items: sequenceAfter },
    { key: 'sequenceBefore', config: dependencySectionStyles.sequenceBefore, items: sequenceBefore },
    { key: 'related', config: dependencySectionStyles.related, items: relatedTasks },
  ].filter((section) => section.items.length > 0);

  let visibleContracts = linkedContracts;
  if (!user.isSuperAdmin && linkedContracts.length > 0) {
    const contractIds = linkedContracts.map((lc) => lc.contract?.id).filter(Boolean) as string[];
    if (contractIds.length > 0) {
      const { data: visibleParts } = await supabase
        .from('contract_participants')
        .select('contract_id')
        .in('contract_id', contractIds)
        .in('agent_id', agentScope);
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
  const executionRuns = (executionRunsRes.data || []) as TaskExecutionRun[];
  const executionCheckpoints = (executionCheckpointsRes.data || []) as TaskExecutionCheckpoint[];
  const attachments = (attachmentsRes || []) as TaskAttachment[];
  const taskActivity = (activityRes || []) as TaskActivityEvent[];

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

  const detailItems = [
    {
      label: 'Assignee',
      value: hasReadOnlyObserverAccess ? (
        <span className="text-[13px] text-gray-300 font-medium">{_assignee ? (_assignee.display_name || _assignee.name) : 'Unassigned'}</span>
      ) : (
        <AssigneePicker
          currentId={task.assignee_agent_id}
          members={members as unknown as Array<{ agent: { id: string; name: string; display_name: string } | null }>}
          projectId={projectId}
          taskId={tid}
        />
      ),
    },
    {
      label: 'Sprint',
      value: hasReadOnlyObserverAccess ? (
        <span className="text-[13px] text-gray-300 font-medium">{_sprint ? _sprint.title : 'Backlog'}</span>
      ) : (
        <SprintPicker currentSprintId={task.sprint_id} sprints={sprints} projectId={projectId} taskId={tid} />
      ),
    },
    {
      label: 'Due date',
      value: hasReadOnlyObserverAccess ? (
        <span className="text-[13px] text-gray-300 font-medium">{task.due_date || 'None'}</span>
      ) : (
        <DueDatePicker value={task.due_date} projectId={projectId} taskId={tid} isOverdue={!!isOverdue} />
      ),
    },
  ];

  const secondaryDetailItems = [
    {
      label: 'Reporter',
      value: reporter ? (
        <span className="text-[13px] text-gray-300 font-medium">{reporter.display_name || reporter.name}</span>
      ) : (
        <span className="text-[12px] text-gray-600 italic">Unknown</span>
      ),
    },
    {
      label: 'Created',
      value: <span className="text-[11px] text-gray-500 font-mono tabular-nums">{formatDate(task.created_at)}</span>,
    },
    {
      label: 'Last updated',
      value: <span className="text-[11px] text-gray-500 font-mono tabular-nums">{formatDateTime(task.updated_at)}</span>,
    },
  ];

  return (
    <AutoRefresh intervalMs={15000}>
      <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
        <div className="flex items-center gap-2 mb-6 animate-fade-in">
          <Link href="/projects" className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">Projects</Link>
          <span className="text-gray-700 text-[10px]">›</span>
          <Link href={`/projects/${projectId}`} className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">
            {project?.title || 'Project'}
          </Link>
          <span className="text-gray-700 text-[10px]">›</span>
          <span className="text-[11px] text-gray-400">Task</span>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(380px,0.9fr)]">
          <div className="space-y-6">
            <section className="rounded-2xl glass-card p-6 animate-fade-in">
              <div className="min-w-0">
                {hasReadOnlyObserverAccess ? (
                  <h1 className="text-[28px] font-bold text-white tracking-tight sm:text-[32px]">{task.title}</h1>
                ) : (
                  <EditableTitle value={task.title} projectId={projectId} taskId={tid} />
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  {hasReadOnlyObserverAccess ? (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${statusConfig[task.status as TaskStatus]?.bg || statusConfig.backlog.bg} ${statusConfig[task.status as TaskStatus]?.text || statusConfig.backlog.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[task.status as TaskStatus]?.dot || statusConfig.backlog.dot}`} />
                      {task.status}
                    </span>
                  ) : (
                    <TaskStatusDropdown projectId={projectId} taskId={tid} currentStatus={task.status} />
                  )}
                  {!hasReadOnlyObserverAccess && <PriorityPicker value={task.priority} projectId={projectId} taskId={tid} />}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${_pc.bg} ${_pc.text}`}>
                    <span>{_pc.icon}</span>
                    {task.priority}
                  </span>
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

              <div className="mt-5 border-t border-white/[0.06] pt-5">
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Description</p>
                    <p className="text-[12px] text-gray-500 mt-2">Keep the brief close to the task metadata instead of pushing it further down the page.</p>
                  </div>
                </div>
                {hasReadOnlyObserverAccess ? (
                  <div className="text-[13px] text-gray-400 leading-relaxed whitespace-pre-wrap">{task.description || 'No description yet.'}</div>
                ) : (
                  <EditableDescription value={task.description} projectId={projectId} taskId={tid} />
                )}
              </div>
            </section>

            {hasReadOnlyObserverAccess && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] px-4 py-3 animate-fade-in" style={{ animationDelay: '0.04s' }}>
                <p className="text-[11px] font-semibold text-cyan-200 uppercase tracking-[0.15em]">Observer mode</p>
                <p className="text-[12px] text-cyan-100/80 mt-2">
                  You can inspect execution state, checkpoints, attachments, and leave analysis notes here, but you cannot change assignees, execution ownership, or task state.
                </p>
              </div>
            )}

            <div className="space-y-6">
              <ExecutionPanel task={task} runs={executionRuns} checkpoints={executionCheckpoints} attachments={attachments} />

              {dependencySections.length > 0 && (
                <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.12s' }}>
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Task links and dependency graph</p>
                      <p className="text-[12px] text-gray-400 mt-2">
                        Full visibility into blocker, downstream, sequencing, and related-task context for this task.
                      </p>
                      {blockerState && <p className="text-[12px] text-gray-500 mt-2">{blockerState.meta}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dependencySections.map((section) => (
                        <span
                          key={section.key}
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${section.config.pill}`}
                        >
                          {section.config.label} · {section.items.length}
                        </span>
                      ))}
                      {blockerState && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold border ${blockerState.tone === 'stale' ? 'text-red-300 bg-red-500/[0.12] border-red-500/25' : blockerState.tone === 'follow-through' ? 'text-amber-300 bg-amber-500/[0.1] border-amber-500/20' : 'text-rose-300 bg-rose-500/[0.08] border-rose-500/20'}`}>
                          {blockerState.tone === 'stale' ? 'Escalate now' : blockerState.tone === 'follow-through' ? 'Follow through now' : 'Tracked blocker'}
                        </span>
                      )}
                    </div>
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
                      {!hasReadOnlyObserverAccess && <BlockerActions projectId={projectId} taskId={tid} canEscalate={blockerState.stale} />}
                    </>
                  )}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                    {dependencySections.map((section) => (
                      <div key={section.key} className={`rounded-xl border p-4 ${section.config.card}`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className={`text-[11px] font-medium ${section.config.accent}`}>{section.config.label}</p>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold ${section.config.pill}`}>
                            {section.items.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {section.items.map((dep) => {
                            const t = dep.tasks;
                            if (!t) return null;
                            const dsc = statusConfig[t.status as TaskStatus] || statusConfig.backlog;
                            return (
                              <Link
                                key={`${section.key}-${dep.id}-${t.id}`}
                                href={`/projects/${t.project_id}/tasks/${t.id}`}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 hover:bg-white/[0.04] transition-colors"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${dsc.dot}`} />
                                <span className="text-[12px] text-gray-300 hover:text-cyan-400 transition-colors">{t.title}</span>
                                <span className={`text-[9px] font-semibold uppercase ${dsc.text} ml-auto`}>{t.status}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <TaskComments comments={comments} projectId={projectId} taskId={tid} />
            </div>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 self-start">
            <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.05s' }}>
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Task snapshot</p>
                  <p className="text-[12px] text-gray-500 mt-2">Fast ownership and scheduling context while reading the task.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {detailItems.map((item) => (
                  <div key={`rail-${item.label}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-600 mb-1.5">{item.label}</p>
                    <div className="min-h-[20px]">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.06s' }}>
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Labels</p>
                  <p className="text-[12px] text-gray-500 mt-2">Compact taxonomy for routing and filtering.</p>
                </div>
              </div>
              {hasReadOnlyObserverAccess ? (
                <div className="flex flex-wrap gap-1.5">
                  {(task.labels || []).length
                    ? (task.labels || []).map((label: string) => (
                        <span key={label} className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-gray-300">
                          {label}
                        </span>
                      ))
                    : <span className="text-[12px] text-gray-500 italic">No labels</span>}
                </div>
              ) : (
                <LabelsEditor labels={task.labels || []} projectId={projectId} taskId={tid} />
              )}
            </div>

            <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.08s' }}>
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Attachments</p>
                  <p className="text-[12px] text-gray-400 mt-2">Task artifacts stay handy in the supporting rail.</p>
                </div>
              </div>
              {!hasReadOnlyObserverAccess && <AttachmentUpload projectId={projectId} taskId={tid} />}
              {hasReadOnlyObserverAccess && (
                <p className="text-[11px] text-gray-500">Observers can inspect attachments but cannot upload new artifacts.</p>
              )}
              <div className="mt-4">
                <AttachmentList attachments={attachments} />
              </div>
            </div>

            {visibleContracts.length > 0 && (
              <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.1s' }}>
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

            <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.12s' }}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Timeline</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1 mb-4">
                {secondaryDetailItems.map((item) => (
                  <div key={`secondary-${item.label}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-600 mb-1.5">{item.label}</p>
                    <div className="min-h-[20px]">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-3">Activity feed</p>
                {taskActivity.length === 0 ? (
                  <p className="text-[12px] text-gray-500">No activity events captured yet.</p>
                ) : (
                  <div className="space-y-3">
                    {taskActivity.map((event) => (
                      <div key={event.id} className="border-l border-cyan-500/20 pl-3">
                        <p className="text-[12px] text-gray-200">{event.summary}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-gray-600">
                          {event.actor_agent?.display_name || event.actor_agent?.name || event.actor_user?.display_name || 'System'} · {formatDateTime(event.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!hasReadOnlyObserverAccess && (
              <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.14s' }}>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Task controls</p>
                <p className="text-[12px] text-gray-500 mb-4">Destructive actions stay tucked into the rail to keep the main flow focused.</p>
                <DeleteTaskButton projectId={projectId} taskId={tid} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </AutoRefresh>
  );
}
