import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/db/server';
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
  PriorityPicker,
  DeleteTaskButton,
} from './task-editor';
import TaskComments from './task-comments';
import AttachmentList from '@/components/attachment-list';
import AttachmentUpload from './attachment-upload';
import type { TaskPriority, TaskAttachment, TaskActivityEvent } from '@/lib/types';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import { listAttachmentsForScope } from '@/lib/attachment-access';
import { listTaskActivityEvents } from '@/lib/task-activity';
import {
  BLOCKER_TONE,
  DEPENDENCY_KIND_TONE,
  colorVarForTone,
  pillClassForTone,
  statusTone,
  surfaceVarForTone,
  type DependencyKind,
  type Tone,
} from '@/lib/status-tone';
import { PageFrame } from '@/components/atoms';
import StatusBadge from '@/components/status-badge';
import styles from './task-detail.module.css';
export const dynamic = 'force-dynamic';

/* Labels here, colours from DEPENDENCY_KIND_TONE — kanban-board.tsx renders the
   same five kinds and the two copies used to disagree about `related`. */
const dependencySectionLabels: Record<DependencyKind, string> = {
  blockedBy: 'Blocked by',
  blocks: 'Blocks',
  sequenceAfter: 'Sequence after',
  sequenceBefore: 'Sequence before',
  related: 'Related tasks',
};

const dependencySectionStyles: Record<string, { label: string; accentColor: string; pillTone: Tone; cardBorder: string; cardBg: string }> =
  Object.fromEntries(
    (Object.keys(dependencySectionLabels) as DependencyKind[]).map((kind) => {
      const tone = DEPENDENCY_KIND_TONE[kind];
      return [kind, {
        label: dependencySectionLabels[kind],
        accentColor: colorVarForTone(tone),
        pillTone: tone,
        cardBorder: colorVarForTone(tone),
        cardBg: surfaceVarForTone(tone),
      }];
    }),
  );

/* This map had `in-progress` mint and `done` mint — the same colour for
   "still going" and "finished" — and `cancelled` rose, which is the failure
   tone. It now reads from status-tone.ts. */
const taskStatusColor = (status: string | null | undefined) => colorVarForTone(statusTone('task', status));

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; tid: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const { id: projectId, tid } = await params;
  const db = createServerClient();
  noStore();

  const { data: task, error } = await db
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
      db
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .in('agent_id', agentScope)
        .limit(1),
      db
        .from('project_observers')
        .select('id')
        .eq('project_id', projectId)
        .in('agent_id', agentScope)
        .limit(1),
      db
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
    membersRes, commentsRes,
    attachmentsRes, activityRes,
  ] = await Promise.all([
    db.from('projects').select('id, title').eq('id', projectId).single(),
    task.assignee_agent_id
      ? db.from('agents').select('id, name, display_name').eq('id', task.assignee_agent_id).single()
      : Promise.resolve({ data: null }),
    task.reporter_agent_id
      ? db.from('agents').select('id, name, display_name').eq('id', task.reporter_agent_id).single()
      : Promise.resolve({ data: null }),
    task.sprint_id
      ? db.from('sprints').select('id, title, status').eq('id', task.sprint_id).single()
      : Promise.resolve({ data: null }),
    db
      .from('task_dependencies')
      .select('id, blocking_task_id, dependency_type, tasks!task_dependencies_blocking_task_id_fkey(id, title, status, project_id)')
      .eq('blocked_task_id', tid),
    db
      .from('task_dependencies')
      .select('id, blocked_task_id, dependency_type, tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id)')
      .eq('blocking_task_id', tid),
    db
      .from('task_contracts')
      .select('id, contract:contracts(id, title, status)')
      .eq('task_id', tid),
    db
      .from('project_members')
      .select('id, role, agent:agents(id, name, display_name)')
      .eq('project_id', projectId),
    db
      .from('task_comments')
      .select('*, author:agents!task_comments_author_agent_id_fkey(id, name, display_name)')
      .eq('task_id', tid)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
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
      const { data: visibleParts } = await db
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
        <span className="text-sm" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{_assignee ? (_assignee.display_name || _assignee.name) : 'Unassigned'}</span>
      ) : (
        <AssigneePicker
          currentId={task.assignee_agent_id}
          members={members as unknown as Array<{ agent: { id: string; name: string; display_name: string } | null }>}
          projectId={projectId}
          taskId={tid}
        />
      ),
    },
    // Sprint and due date are shown when they have a value and are not
    // editable here. Sprints were last touched in April and `due_date` is set
    // on 0 of 94 tasks, so the pickers were controls for fields nobody uses —
    // while an empty "Due date: None" row appeared on every task in the
    // product. Both are still writable through the API and the CLI
    // (`holloway task-update --sprint`, `--due-date`); only the editors went.
    ...(_sprint
      ? [{
          label: 'Sprint',
          value: <span className="text-sm" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{_sprint.title}</span>,
        }]
      : []),
    ...(task.due_date
      ? [{
          label: 'Due date',
          value: (
            <span
              className="text-sm"
              style={{ color: isOverdue ? 'var(--rose)' : 'var(--fg-1)', fontWeight: 500 }}
            >
              {formatDate(task.due_date)}
            </span>
          ),
        }]
      : []),
  ];

  const secondaryDetailItems = [
    {
      label: 'Reporter',
      value: reporter ? (
        <span className="text-sm" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{reporter.display_name || reporter.name}</span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--fg-3)', fontStyle: 'italic' }}>Unknown</span>
      ),
    },
    {
      label: 'Created',
      value: <span className="mono text-2xs" style={{ color: 'var(--fg-2)' }}>{formatDate(task.created_at)}</span>,
    },
    {
      label: 'Last updated',
      value: <span className="mono text-2xs" style={{ color: 'var(--fg-2)' }}>{formatDateTime(task.updated_at)}</span>,
    },
  ];

  return (
    <AutoRefresh intervalMs={15000} watch={['tasks', 'projects', 'contracts', 'participants']}>
      <PageFrame width="wide">
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/projects">Projects</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/projects/${projectId}`}>{project?.title || 'Project'}</Link>
          <span aria-hidden="true">›</span>
          <span>Task</span>
        </nav>

        <div className={styles.layout}>
          <main className={styles.main}>
            <section className="card" aria-label="Task overview">
              <div className={styles.heroBar}>
                <span className={styles.heroBarLabel}>Task</span>
                {hasReadOnlyObserverAccess ? (
                  <StatusBadge status={task.status} domain="task" dot="static" size="lg" />
                ) : (
                  <TaskStatusDropdown projectId={projectId} taskId={tid} currentStatus={task.status} />
                )}
                {hasReadOnlyObserverAccess ? (
                  <span className="pill">{task.priority} priority</span>
                ) : (
                  <PriorityPicker value={task.priority as TaskPriority} projectId={projectId} taskId={tid} />
                )}
                {isOverdue && <StatusBadge status={null} label="Overdue" tone="rose" dot="none" size="lg" />}
                {blockerState && (
                  <StatusBadge
                    status={null}
                    label={blockerState.tone === 'stale' ? 'Blocked · stale escalation' : blockerState.tone === 'follow-through' ? 'Blocked · follow-through due' : 'Blocked'}
                    tone={blockerState.tone === 'follow-through' ? 'amber' : 'rose'}
                    dot="none"
                    size="lg"
                  />
                )}
              </div>
              <div className={styles.heroBody}>
                {hasReadOnlyObserverAccess ? (
                  <h1 className="h1">{task.title}</h1>
                ) : (
                  <EditableTitle value={task.title} projectId={projectId} taskId={tid} />
                )}
                <div className={styles.description}>
                  <p className={styles.sectionLabel}>Description</p>
                  {hasReadOnlyObserverAccess ? (
                    <div className="text-sm" style={{ color: 'var(--fg-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.description || 'No description yet.'}</div>
                  ) : (
                    <EditableDescription value={task.description} projectId={projectId} taskId={tid} />
                  )}
                </div>
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
                <p className="upper text-2xs" style={{ fontWeight: 600, color: 'var(--peri)' }}>Observer mode</p>
                <p className="text-xs" style={{ color: 'var(--fg-1)', marginTop: '0.5rem' }}>
                  You can inspect this task, its dependencies and attachments, and leave analysis notes here, but you cannot change assignees, execution ownership, or task state. Execution runs and checkpoints are in the protocol inspector.
                </p>
              </div>
            )}

            <div className="space-y-6">
              {/* Dependencies */}
              {dependencySections.length > 0 && (
                <div className="card animate-fade-in" style={{ padding: 'var(--space-5)', animationDelay: '0.12s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <p className="upper text-2xs" style={{ fontWeight: 600, color: 'var(--fg-3)' }}>Task links and dependency graph</p>
                      <p className="text-xs" style={{ color: 'var(--fg-2)', marginTop: '0.5rem' }}>
                        Full visibility into blocker, downstream, sequencing, and related-task context for this task.
                      </p>
                      {blockerState && <p className="text-xs" style={{ color: 'var(--fg-3)', marginTop: '0.5rem' }}>{blockerState.meta}</p>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {dependencySections.map((section) => (
                        <span
                          key={section.key}
                          className={`pill pill--${section.config.pillTone} text-2xs`}
                          style={{ fontWeight: 600 }}
                        >
                          {section.config.label} · {section.items.length}
                        </span>
                      ))}
                      {blockerState && (
                        <span
                          className={`${pillClassForTone(BLOCKER_TONE[blockerState.tone])} text-2xs`}
                          style={{ fontWeight: 600 }}
                        >
                          {blockerState.tone === 'stale' ? 'Escalate now' : blockerState.tone === 'follow-through' ? 'Follow through now' : 'Tracked blocker'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                    {dependencySections.map((section) => (
                      <div
                        key={section.key}
                        style={{
                          borderRadius: 'var(--radius-4)',
                          border: `1px solid ${section.config.cardBorder}`,
                          background: section.config.cardBg,
                          padding: 'var(--space-4)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          <p className="text-2xs" style={{ fontWeight: 500, color: section.config.accentColor }}>{section.config.label}</p>
                          <span className={`pill pill--${section.config.pillTone} text-2xs`} style={{ fontWeight: 600 }}>
                            {section.items.length}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {section.items.map((dep) => {
                            const t = dep.tasks;
                            if (!t) return null;
                            const dotColor = taskStatusColor(t.status);
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
                                <span className="text-xs" style={{ color: 'var(--fg-1)', flex: 1 }}>{t.title}</span>
                                <span className="upper text-2xs" style={{ fontWeight: 600, color: dotColor }}>{t.status}</span>
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
          </main>

          {/* Context rail */}
          <aside className={styles.sidebar}>
            <section className={`card ${styles.railCard}`} aria-labelledby="task-glance-heading">
              <h2 id="task-glance-heading" className={styles.sectionLabel}>At a glance</h2>
              <div className={styles.railFacts}>
                {[...detailItems, ...secondaryDetailItems].map((item) => (
                  <div key={item.label} className={styles.railFact}>
                    <p className="upper">{item.label}</p>
                    <div>{item.value}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Labels */}
            <section className={`card ${styles.railCard}`} aria-labelledby="task-labels-heading">
              <h2 id="task-labels-heading" className={styles.sectionLabel}>Labels</h2>
              {hasReadOnlyObserverAccess ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {(task.labels || []).length
                    ? (task.labels || []).map((label: string) => (
                        <span key={label} className="pill text-2xs">
                          {label}
                        </span>
                      ))
                    : <span className="text-xs" style={{ color: 'var(--fg-3)', fontStyle: 'italic' }}>No labels</span>}
                </div>
              ) : (
                <LabelsEditor labels={task.labels || []} projectId={projectId} taskId={tid} />
              )}
            </section>

            {/* Attachments */}
            <section className={`card ${styles.railCard}`} aria-labelledby="task-attachments-heading">
              <h2 id="task-attachments-heading" className={styles.sectionLabel}>Attachments</h2>
              {!hasReadOnlyObserverAccess && <AttachmentUpload projectId={projectId} taskId={tid} />}
              {hasReadOnlyObserverAccess && (
                <p className="text-2xs" style={{ color: 'var(--fg-3)' }}>Observers can inspect attachments but cannot upload new artifacts.</p>
              )}
              <div style={{ marginTop: '1rem' }}>
                <AttachmentList attachments={attachments} />
              </div>
            </section>

            {/* Linked Contracts */}
            {visibleContracts.length > 0 && (
              <section className={`card ${styles.railCard}`} aria-labelledby="task-contracts-heading">
                <h2 id="task-contracts-heading" className={styles.sectionLabel}>Linked contracts</h2>
                <div className={styles.railList}>
                  {visibleContracts.map((lc) => {
                    const c = lc.contract;
                    if (!c) return null;
                    return (
                      <Link
                        key={lc.id}
                        href={`/contracts/${c.id}`}
                        className={styles.railLink}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--peri)', flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <span className="text-xs" style={{ color: 'var(--fg-1)', flex: 1 }}>{c.title}</span>
                        <StatusBadge status={c.status} dot="none" size="sm" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {taskActivity.length > 0 && (
              <section className={`card ${styles.railCard}`} aria-labelledby="task-activity-heading">
                <h2 id="task-activity-heading" className={styles.sectionLabel}>Activity</h2>
                <div className={styles.activity}>
                  {taskActivity.map((event) => (
                    <div key={event.id} className={styles.activityItem}>
                      <p className="text-xs" style={{ color: 'var(--fg-1)' }}>{event.summary}</p>
                      <p className="text-2xs" style={{ color: 'var(--fg-3)' }}>
                        {event.actor_agent?.display_name || event.actor_agent?.name || event.actor_user?.display_name || 'System'} · {formatDateTime(event.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Task controls */}
            {!hasReadOnlyObserverAccess && (
              <section className={`card ${styles.railCard}`} aria-labelledby="task-controls-heading">
                <h2 id="task-controls-heading" className={styles.sectionLabel}>Task controls</h2>
                <DeleteTaskButton projectId={projectId} taskId={tid} />
              </section>
            )}
          </aside>
        </div>
      </PageFrame>
    </AutoRefresh>
  );
}
