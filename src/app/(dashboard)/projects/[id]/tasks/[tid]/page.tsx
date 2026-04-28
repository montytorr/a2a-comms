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

const dependencySectionStyles: Record<string, { label: string; accentColor: string; pillTone: string; cardBorder: string; cardBg: string }> = {
  blockedBy: {
    label: 'Blocked by',
    accentColor: 'var(--rose)',
    pillTone: 'rose',
    cardBorder: 'var(--rose)',
    cardBg: 'var(--rose-bg)',
  },
  blocks: {
    label: 'Blocks',
    accentColor: 'var(--amber)',
    pillTone: 'amber',
    cardBorder: 'var(--amber)',
    cardBg: 'var(--amber-bg)',
  },
  sequenceAfter: {
    label: 'Sequence after',
    accentColor: 'var(--peri)',
    pillTone: 'peri',
    cardBorder: 'var(--peri)',
    cardBg: 'var(--peri-bg)',
  },
  sequenceBefore: {
    label: 'Sequence before',
    accentColor: 'var(--peri)',
    pillTone: 'peri',
    cardBorder: 'var(--peri)',
    cardBg: 'var(--peri-bg)',
  },
  related: {
    label: 'Related tasks',
    accentColor: 'var(--mint)',
    pillTone: 'mint',
    cardBorder: 'var(--mint)',
    cardBg: 'var(--mint-bg)',
  },
};

const statusDotColor: Record<string, string> = {
  backlog: 'var(--fg-3)',
  todo: 'var(--peri)',
  'in-progress': 'var(--mint)',
  'in-review': 'var(--amber)',
  done: 'var(--mint)',
  cancelled: 'var(--rose)',
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
  const blockedBy = ((blockedByRes.data || []) as unknown as Array<TaskDep & { dependency_type?: string }>)
    .filter((dep) => dep.tasks?.project_id === projectId && dep.dependency_type === 'blocks')
    .filter((dep) => dep.tasks?.status !== 'done' && dep.tasks?.status !== 'cancelled');
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

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const blockerState = blockedBy.length > 0
    ? getBlockedTaskNotificationState({
        updatedAt: task.updated_at,
        blockedAt: task.blocked_at,
        blockerFollowUpAt: task.blocker_follow_up_at,
        blockerFollowedThroughAt: task.blocker_followed_through_at,
        blockerEscalatedAt: task.blocker_escalated_at,
        blockerResolutionAction: task.blocker_resolution_action,
        blockerResolutionOwner: task.blocker_resolution_owner,
        blockerResolutionDueAt: task.blocker_resolution_due_at,
        blockerResolutionStatus: task.blocker_resolution_status,
        blockedByCount: blockedBy.length,
        blockingTaskTitles: blockedBy.map((dep) => dep.tasks?.title || '').filter(Boolean),
      })
    : null;

  const detailItems = [
    {
      label: 'Assignee',
      value: hasReadOnlyObserverAccess ? (
        <span style={{ fontSize: '13px', color: 'var(--fg-1)', fontWeight: 500 }}>{_assignee ? (_assignee.display_name || _assignee.name) : 'Unassigned'}</span>
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
        <span style={{ fontSize: '13px', color: 'var(--fg-1)', fontWeight: 500 }}>{_sprint ? _sprint.title : 'Backlog'}</span>
      ) : (
        <SprintPicker currentSprintId={task.sprint_id} sprints={sprints} projectId={projectId} taskId={tid} />
      ),
    },
    {
      label: 'Due date',
      value: hasReadOnlyObserverAccess ? (
        <span style={{ fontSize: '13px', color: 'var(--fg-1)', fontWeight: 500 }}>{task.due_date || 'None'}</span>
      ) : (
        <DueDatePicker value={task.due_date} projectId={projectId} taskId={tid} isOverdue={!!isOverdue} />
      ),
    },
  ];

  const secondaryDetailItems = [
    {
      label: 'Reporter',
      value: reporter ? (
        <span style={{ fontSize: '13px', color: 'var(--fg-1)', fontWeight: 500 }}>{reporter.display_name || reporter.name}</span>
      ) : (
        <span style={{ fontSize: '12px', color: 'var(--fg-3)', fontStyle: 'italic' }}>Unknown</span>
      ),
    },
    {
      label: 'Created',
      value: <span className="mono" style={{ fontSize: '11px', color: 'var(--fg-2)' }}>{formatDate(task.created_at)}</span>,
    },
    {
      label: 'Last updated',
      value: <span className="mono" style={{ fontSize: '11px', color: 'var(--fg-2)' }}>{formatDateTime(task.updated_at)}</span>,
    },
  ];

  return (
    <AutoRefresh intervalMs={15000}>
      <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '1rem 1.5rem' }} className="lg:px-10 lg:py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 animate-fade-in">
          <Link href="/projects" style={{ fontSize: '11px', color: 'var(--fg-3)', textDecoration: 'none' }}>Projects</Link>
          <span style={{ color: 'var(--fg-3)', fontSize: '10px' }}>›</span>
          <Link href={`/projects/${projectId}`} style={{ fontSize: '11px', color: 'var(--fg-3)', textDecoration: 'none' }}>
            {project?.title || 'Project'}
          </Link>
          <span style={{ color: 'var(--fg-3)', fontSize: '10px' }}>›</span>
          <span style={{ fontSize: '11px', color: 'var(--fg-2)' }}>Task</span>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(380px,0.9fr)]">
          <div className="space-y-6">
            {/* Main task card */}
            <section className="card animate-fade-in" style={{ padding: '1.5rem' }}>
              <div style={{ minWidth: 0 }}>
                {hasReadOnlyObserverAccess ? (
                  <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--fg-0)', letterSpacing: '-0.02em' }}>{task.title}</h1>
                ) : (
                  <EditableTitle value={task.title} projectId={projectId} taskId={tid} />
                )}
                <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.625rem' }}>
                  {hasReadOnlyObserverAccess ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: statusDotColor[task.status as TaskStatus] ?? 'var(--fg-2)',
                        background: 'var(--bg-2)',
                        border: '1px solid var(--line-1)',
                      }}
                    >
                      <span
                        style={{
                          width: '0.375rem',
                          height: '0.375rem',
                          borderRadius: '50%',
                          background: statusDotColor[task.status as TaskStatus] ?? 'var(--fg-3)',
                          display: 'inline-block',
                        }}
                      />
                      {task.status}
                    </span>
                  ) : (
                    <TaskStatusDropdown projectId={projectId} taskId={tid} currentStatus={task.status} />
                  )}
                  {hasReadOnlyObserverAccess ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        borderRadius: '9999px',
                        padding: '0.25rem 0.625rem',
                        fontSize: '10px',
                        fontWeight: 600,
                        background: 'var(--bg-2)',
                        border: '1px solid var(--line-1)',
                        color: 'var(--fg-1)',
                      }}
                    >
                      {task.priority}
                    </span>
                  ) : (
                    <PriorityPicker value={task.priority as TaskPriority} projectId={projectId} taskId={tid} />
                  )}
                  {isOverdue && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'var(--rose)',
                        background: 'var(--rose-bg)',
                        border: '1px solid var(--rose)',
                      }}
                    >
                      Overdue
                    </span>
                  )}
                  {blockerState && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        border: '1px solid',
                        color: blockerState.tone === 'stale' ? 'var(--rose)' : blockerState.tone === 'follow-through' ? 'var(--amber)' : 'var(--rose)',
                        background: blockerState.tone === 'stale' ? 'var(--rose-bg)' : blockerState.tone === 'follow-through' ? 'var(--amber-bg)' : 'var(--rose-bg)',
                        borderColor: blockerState.tone === 'stale' ? 'var(--rose)' : blockerState.tone === 'follow-through' ? 'var(--amber)' : 'var(--rose)',
                      }}
                    >
                      {blockerState.tone === 'stale' ? 'Blocked · stale escalation' : blockerState.tone === 'follow-through' ? 'Blocked · follow-through due' : 'Blocked'}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--line-1)', paddingTop: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)' }}>Description</p>
                    <p style={{ fontSize: '12px', color: 'var(--fg-3)', marginTop: '0.5rem' }}>Keep the brief close to the task metadata instead of pushing it further down the page.</p>
                  </div>
                </div>
                {hasReadOnlyObserverAccess ? (
                  <div style={{ fontSize: '13px', color: 'var(--fg-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.description || 'No description yet.'}</div>
                ) : (
                  <EditableDescription value={task.description} projectId={projectId} taskId={tid} />
                )}
              </div>
            </section>

            {/* Observer mode banner */}
            {hasReadOnlyObserverAccess && (
              <div
                className="animate-fade-in"
                style={{
                  borderRadius: '1rem',
                  border: '1px solid var(--peri)',
                  background: 'var(--peri-bg)',
                  padding: '0.75rem 1rem',
                  animationDelay: '0.04s',
                }}
              >
                <p className="upper" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--peri)' }}>Observer mode</p>
                <p style={{ fontSize: '12px', color: 'var(--fg-1)', marginTop: '0.5rem' }}>
                  You can inspect execution state, checkpoints, attachments, and leave analysis notes here, but you cannot change assignees, execution ownership, or task state.
                </p>
              </div>
            )}

            <div className="space-y-6">
              <ExecutionPanel task={task} runs={executionRuns} checkpoints={executionCheckpoints} attachments={attachments} />

              {/* Dependencies */}
              {dependencySections.length > 0 && (
                <div className="card animate-fade-in" style={{ padding: '1.5rem', animationDelay: '0.12s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)' }}>Task links and dependency graph</p>
                      <p style={{ fontSize: '12px', color: 'var(--fg-2)', marginTop: '0.5rem' }}>
                        Full visibility into blocker, downstream, sequencing, and related-task context for this task.
                      </p>
                      {blockerState && <p style={{ fontSize: '12px', color: 'var(--fg-3)', marginTop: '0.5rem' }}>{blockerState.meta}</p>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {dependencySections.map((section) => (
                        <span
                          key={section.key}
                          className={`pill pill--${section.config.pillTone}`}
                          style={{ fontSize: '10px', fontWeight: 600 }}
                        >
                          {section.config.label} · {section.items.length}
                        </span>
                      ))}
                      {blockerState && (
                        <span
                          className={`pill pill--${blockerState.tone === 'stale' ? 'rose' : blockerState.tone === 'follow-through' ? 'amber' : 'rose'}`}
                          style={{ fontSize: '10px', fontWeight: 600 }}
                        >
                          {blockerState.tone === 'stale' ? 'Escalate now' : blockerState.tone === 'follow-through' ? 'Follow through now' : 'Tracked blocker'}
                        </span>
                      )}
                    </div>
                  </div>

                  {blockerState && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem', fontSize: '11px' }}>
                        {[
                          { label: 'Blocked since', value: formatDateTime(blockerState.blockedSince) },
                          { label: 'Unblock owner', value: blockerState.blockerResolutionOwner || 'Unassigned' },
                          { label: 'Expected follow-up', value: blockerState.blockerResolutionDueAt ? formatDateTime(blockerState.blockerResolutionDueAt) : 'Not scheduled' },
                          { label: 'Next action', value: blockerState.blockerResolutionAction || 'No unblock plan logged yet', wide: true },
                          { label: 'Last follow-up', value: blockerState.blockerFollowedThroughAt ? formatDateTime(blockerState.blockerFollowedThroughAt) : 'None logged' },
                          { label: 'Escalation', value: blockerState.blockerEscalatedAt ? formatDateTime(blockerState.blockerEscalatedAt) : 'Not escalated' },
                          { label: 'Workflow state', value: blockerState.blockerResolutionStatus || 'Blocked' },
                        ].map((item) => (
                          <div key={item.label} className="card--inset" style={{ padding: '0.5rem 0.75rem', gridColumn: item.wide ? '1 / -1' : undefined }}>
                            <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '0.25rem' }}>{item.label}</p>
                            <p style={{ color: 'var(--fg-1)', lineHeight: 1.5 }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {!hasReadOnlyObserverAccess && <BlockerActions projectId={projectId} taskId={tid} canEscalate={blockerState.stale} currentAction={blockerState.blockerResolutionAction} currentOwner={blockerState.blockerResolutionOwner} currentDueAt={blockerState.blockerResolutionDueAt} />}
                    </>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                    {dependencySections.map((section) => (
                      <div
                        key={section.key}
                        style={{
                          borderRadius: '0.75rem',
                          border: `1px solid ${section.config.cardBorder}`,
                          background: section.config.cardBg,
                          padding: '1rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          <p style={{ fontSize: '11px', fontWeight: 500, color: section.config.accentColor }}>{section.config.label}</p>
                          <span className={`pill pill--${section.config.pillTone}`} style={{ fontSize: '9px', fontWeight: 600 }}>
                            {section.items.length}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {section.items.map((dep) => {
                            const t = dep.tasks;
                            if (!t) return null;
                            const dotColor = statusDotColor[t.status as TaskStatus] ?? 'var(--fg-3)';
                            return (
                              <Link
                                key={`${section.key}-${dep.id}-${t.id}`}
                                href={`/projects/${t.project_id}/tasks/${t.id}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '0.5rem',
                                  background: 'var(--bg-0)',
                                  textDecoration: 'none',
                                  transition: 'background 0.1s',
                                }}
                              >
                                <span style={{ width: '0.375rem', height: '0.375rem', borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: '12px', color: 'var(--fg-1)', flex: 1 }}>{t.title}</span>
                                <span className="upper" style={{ fontSize: '9px', fontWeight: 600, color: dotColor }}>{t.status}</span>
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

          {/* Sidebar */}
          <aside className="space-y-6 xl:sticky xl:top-6 self-start">
            {/* Snapshot */}
            <div className="card animate-fade-in" style={{ padding: '1.25rem', animationDelay: '0.05s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)' }}>Task snapshot</p>
                  <p style={{ fontSize: '12px', color: 'var(--fg-3)', marginTop: '0.5rem' }}>Fast ownership and scheduling context while reading the task.</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }} className="xl:grid-cols-1">
                {detailItems.map((item) => (
                  <div key={`rail-${item.label}`} className="card--inset" style={{ padding: '0.75rem' }}>
                    <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '0.375rem' }}>{item.label}</p>
                    <div style={{ minHeight: '1.25rem' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Labels */}
            <div className="card animate-fade-in" style={{ padding: '1.25rem', animationDelay: '0.06s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)' }}>Labels</p>
                  <p style={{ fontSize: '12px', color: 'var(--fg-3)', marginTop: '0.5rem' }}>Compact taxonomy for routing and filtering.</p>
                </div>
              </div>
              {hasReadOnlyObserverAccess ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {(task.labels || []).length
                    ? (task.labels || []).map((label: string) => (
                        <span key={label} className="pill" style={{ fontSize: '11px' }}>
                          {label}
                        </span>
                      ))
                    : <span style={{ fontSize: '12px', color: 'var(--fg-3)', fontStyle: 'italic' }}>No labels</span>}
                </div>
              ) : (
                <LabelsEditor labels={task.labels || []} projectId={projectId} taskId={tid} />
              )}
            </div>

            {/* Attachments */}
            <div className="card animate-fade-in" style={{ padding: '1.25rem', animationDelay: '0.08s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)' }}>Attachments</p>
                  <p style={{ fontSize: '12px', color: 'var(--fg-2)', marginTop: '0.5rem' }}>Task artifacts stay handy in the supporting rail.</p>
                </div>
              </div>
              {!hasReadOnlyObserverAccess && <AttachmentUpload projectId={projectId} taskId={tid} />}
              {hasReadOnlyObserverAccess && (
                <p style={{ fontSize: '11px', color: 'var(--fg-3)' }}>Observers can inspect attachments but cannot upload new artifacts.</p>
              )}
              <div style={{ marginTop: '1rem' }}>
                <AttachmentList attachments={attachments} />
              </div>
            </div>

            {/* Linked Contracts */}
            {visibleContracts.length > 0 && (
              <div className="card animate-fade-in" style={{ padding: '1.25rem', animationDelay: '0.1s' }}>
                <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '1rem' }}>Linked Contracts</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {visibleContracts.map((lc) => {
                    const c = lc.contract;
                    if (!c) return null;
                    return (
                      <Link
                        key={lc.id}
                        href={`/contracts/${c.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.5rem',
                          background: 'var(--bg-2)',
                          textDecoration: 'none',
                          transition: 'background 0.1s',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--peri)', flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <span style={{ fontSize: '12px', color: 'var(--fg-1)', flex: 1 }}>{c.title}</span>
                        <span className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)' }}>{c.status}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="card animate-fade-in" style={{ padding: '1.25rem', animationDelay: '0.12s' }}>
              <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '1rem' }}>Timeline</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }} className="xl:grid-cols-1">
                {secondaryDetailItems.map((item) => (
                  <div key={`secondary-${item.label}`} className="card--inset" style={{ padding: '0.75rem' }}>
                    <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '0.375rem' }}>{item.label}</p>
                    <div style={{ minHeight: '1.25rem' }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="card--inset" style={{ padding: '0.75rem' }}>
                <p className="upper" style={{ fontSize: '10px', color: 'var(--fg-3)', marginBottom: '0.75rem' }}>Activity feed</p>
                {taskActivity.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--fg-3)' }}>No activity events captured yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {taskActivity.map((event) => (
                      <div key={event.id} style={{ borderLeft: '1px solid var(--peri)', paddingLeft: '0.75rem' }}>
                        <p style={{ fontSize: '12px', color: 'var(--fg-1)' }}>{event.summary}</p>
                        <p className="upper" style={{ marginTop: '0.25rem', fontSize: '10px', color: 'var(--fg-3)' }}>
                          {event.actor_agent?.display_name || event.actor_agent?.name || event.actor_user?.display_name || 'System'} · {formatDateTime(event.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Task controls */}
            {!hasReadOnlyObserverAccess && (
              <div className="card animate-fade-in" style={{ padding: '1.25rem', animationDelay: '0.14s' }}>
                <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '1rem' }}>Task controls</p>
                <p style={{ fontSize: '12px', color: 'var(--fg-3)', marginBottom: '1rem' }}>Destructive actions stay tucked into the rail to keep the main flow focused.</p>
                <DeleteTaskButton projectId={projectId} taskId={tid} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </AutoRefresh>
  );
}
