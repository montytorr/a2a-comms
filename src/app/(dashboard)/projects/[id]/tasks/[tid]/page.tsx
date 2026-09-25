import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/db/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect, notFound } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format-date';
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
import MarkdownPreview from '@/components/markdown-preview';
import AttachmentUpload from './attachment-upload';
import type { TaskPriority, TaskAttachment } from '@/lib/types';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import { listAttachmentsForScope } from '@/lib/attachment-access';
import {
  DEPENDENCY_KIND_TONE,
  colorVarForTone,
  statusTone,
  surfaceVarForTone,
  taskPriorityTone,
  type DependencyKind,
  type Tone,
} from '@/lib/status-tone';
import { PageFrame } from '@/components/atoms';
import StatusBadge from '@/components/status-badge';
import styles from './task-detail.module.css';
export const dynamic = 'force-dynamic';

/* The feed loads the newest 100 and renders them oldest-first, so on a busy
   task it starts mid-conversation. TaskComments says so when the cap is hit. */
const COMMENT_PAGE_SIZE = 100;

/* Labels here, colours from DEPENDENCY_KIND_TONE, so this and the project
   task list cannot disagree about a kind the way they once did. */
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
    attachmentsRes,
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
      .limit(COMMENT_PAGE_SIZE),
    listAttachmentsForScope({
      projectId,
      taskId: tid,
      includeSignedUrl: true,
    }),
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

  const glanceFacts: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: 'Assignee',
      value: hasReadOnlyObserverAccess ? (
        <span className={styles.railValue}>{_assignee ? (_assignee.display_name || _assignee.name) : 'Unassigned'}</span>
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
      label: 'Reporter',
      value: reporter ? (
        <span className={styles.railValue}>{reporter.display_name || reporter.name}</span>
      ) : (
        <span className={styles.railMuted}>Unknown</span>
      ),
    },
    // Sprint and due date are shown when they have a value and are not
    // editable here. Sprints were last touched in April and `due_date` is set
    // on 0 of 94 tasks, so the pickers were controls for fields nobody uses —
    // while an empty "Due date: None" row appeared on every task in the
    // product. Both are still writable through the API and the CLI
    // (`holloway task-update --sprint`, `--due-date`); only the editors went.
    ...(_sprint
      ? [{ label: 'Sprint', value: <span className={styles.railValue}>{_sprint.title}</span> }]
      : []),
    ...(task.due_date
      ? [{
          label: 'Due date',
          value: (
            <span className={styles.railValue} style={isOverdue ? { color: 'var(--rose)' } : undefined}>
              {formatDate(task.due_date)}
            </span>
          ),
        }]
      : []),
    {
      label: 'Created',
      value: <span className={styles.railMeta} title={formatDateTime(task.created_at)}>{formatDate(task.created_at)}</span>,
    },
    {
      label: 'Last updated',
      value: (
        <span className={styles.railMeta} title={formatDateTime(task.updated_at)}>
          {formatRelative(task.updated_at)}
        </span>
      ),
    },
    // Labels were a card of their own beside "At a glance", which gave a
    // two-chip list the same weight as the task's attachments. They are a
    // fact about the task, so they sit with the other facts.
    {
      label: 'Labels',
      value: hasReadOnlyObserverAccess ? (
        <div className={styles.railPills}>
          {(task.labels || []).length
            ? (task.labels || []).map((label: string) => (
                <span key={label} className="pill text-2xs">{label}</span>
              ))
            : <span className={styles.railMuted}>No labels</span>}
        </div>
      ) : (
        <LabelsEditor labels={task.labels || []} projectId={projectId} taskId={tid} />
      ),
    },
  ];

  const stateBadges = (
    <>
      {hasReadOnlyObserverAccess ? (
        <StatusBadge status={task.status} domain="task" dot="static" size="lg" />
      ) : (
        <TaskStatusDropdown projectId={projectId} taskId={tid} currentStatus={task.status} />
      )}
      {hasReadOnlyObserverAccess ? (
        <StatusBadge
          status={null}
          label={`${task.priority} priority`}
          tone={taskPriorityTone(task.priority)}
          dot="static"
          size="lg"
          style={{ textTransform: 'capitalize' }}
        />
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
    </>
  );

  return (
    <AutoRefresh intervalMs={15000} watch={['tasks', 'projects', 'contracts', 'participants']}>
      <PageFrame width="wide">
        {/* The title identifies the task, so it spans the page above the
            two columns rather than sitting in one of them. */}
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/projects">Projects</Link>
            <span aria-hidden="true">›</span>
            <Link href={`/projects/${projectId}`}>{project?.title || 'Project'}</Link>
            <span aria-hidden="true">›</span>
            <span className={styles.current} aria-current="page">{task.title}</span>
          </nav>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Task</p>
            {hasReadOnlyObserverAccess ? (
              <h1 className="h1">{task.title}</h1>
            ) : (
              <EditableTitle value={task.title} projectId={projectId} taskId={tid} />
            )}
          </div>
          {/* Status and priority describe the title, so they sit under it on
              the same left edge. The old hero bar pushed them to the far
              right of the card, as far from the title as the row allowed. */}
          <div className={styles.headerControls}>{stateBadges}</div>
        </header>

        <div className={styles.layout}>
          <div className={styles.main}>
            {hasReadOnlyObserverAccess && (
              <div className={`animate-fade-in ${styles.observerNote}`}>
                <p className={styles.sectionLabel} style={{ margin: 0, color: 'var(--peri)' }}>Observer mode</p>
                <p>
                  You can inspect this task, its dependencies and attachments, and leave analysis notes here, but you cannot change assignees, execution ownership, or task state. Execution runs and checkpoints are in the protocol inspector.
                </p>
              </div>
            )}

            <section className={`card ${styles.panel}`} aria-labelledby="task-description-heading">
              <h2 id="task-description-heading" className={styles.sectionLabel}>Description</h2>
              <div className={styles.description}>
                {hasReadOnlyObserverAccess ? (
                  task.description
                    ? <MarkdownPreview content={task.description} />
                    : <p className={styles.railMuted}>No description yet.</p>
                ) : (
                  <EditableDescription value={task.description} projectId={projectId} taskId={tid} />
                )}
              </div>
            </section>

            {dependencySections.length > 0 && (
              <section className={`card animate-fade-in ${styles.panel}`} aria-labelledby="task-links-heading" style={{ animationDelay: '0.06s' }}>
                <div className={styles.panelHead}>
                  <div className={styles.panelHeadText}>
                    <h2 id="task-links-heading" className={styles.panelTitle}>Links and dependencies</h2>
                    <p className={styles.panelSub}>
                      {blockerState
                        ? blockerState.meta
                        : 'What this task waits on, what waits on it, and the work it sits beside.'}
                    </p>
                  </div>
                </div>

                <div className={styles.depGrid}>
                  {dependencySections.map((section) => (
                    <div
                      key={section.key}
                      className={styles.depGroup}
                      style={{ borderColor: section.config.cardBorder, background: section.config.cardBg }}
                    >
                      <div className={styles.depGroupHead}>
                        <p className={styles.depGroupLabel} style={{ color: section.config.accentColor }}>{section.config.label}</p>
                        <span className={`pill pill--${section.config.pillTone} text-2xs`} style={{ fontWeight: 600 }}>
                          {section.items.length}
                        </span>
                      </div>
                      <div className={styles.depList}>
                        {section.items.map((dep) => {
                          const t = dep.tasks;
                          if (!t) return null;
                          const dotColor = taskStatusColor(t.status);
                          return (
                            <Link
                              key={`${section.key}-${dep.id}-${t.id}`}
                              href={`/projects/${t.project_id}/tasks/${t.id}`}
                              className={styles.depLink}
                            >
                              <span className={styles.depDot} style={{ background: dotColor }} />
                              <span className={styles.depTitle}>{t.title}</span>
                              <span className={styles.depStatus} style={{ color: dotColor }}>{t.status}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <TaskComments
              comments={comments}
              projectId={projectId}
              taskId={tid}
              truncated={comments.length >= COMMENT_PAGE_SIZE}
            />
          </div>

          {/* Context rail. Deliberately free of its own scroll container:
              see task-detail.module.css. */}
          <aside className={styles.sidebar} aria-label="Task context">
            <section className={`card ${styles.railCard}`} aria-labelledby="task-glance-heading">
              <h2 id="task-glance-heading" className={styles.sectionLabel}>At a glance</h2>
              <div className={styles.railFacts}>
                {glanceFacts.map((item) => (
                  <div key={item.label} className={styles.railFact}>
                    <p className="upper">{item.label}</p>
                    <div>{item.value}</div>
                  </div>
                ))}
              </div>
            </section>

            {visibleContracts.length > 0 && (
              <section className={`card ${styles.railCard}`} aria-labelledby="task-contracts-heading">
                <h2 id="task-contracts-heading" className={styles.sectionLabel}>Linked contracts</h2>
                <div className={styles.railList}>
                  {visibleContracts.map((lc) => {
                    const c = lc.contract;
                    if (!c) return null;
                    return (
                      <Link key={lc.id} href={`/contracts/${c.id}`} className={styles.railLink}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--peri)', flexShrink: 0 }} aria-hidden="true">
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

            <section className={`card ${styles.railCard}`} aria-labelledby="task-attachments-heading">
              <h2 id="task-attachments-heading" className={styles.sectionLabel}>Attachments</h2>
              {hasReadOnlyObserverAccess ? (
                <p className={styles.railIntro}>Observers can inspect attachments but cannot upload new artifacts.</p>
              ) : (
                <AttachmentUpload projectId={projectId} taskId={tid} />
              )}
              <div style={{ marginTop: 'var(--space-4)' }}>
                <AttachmentList attachments={attachments} />
              </div>
            </section>

            {/* The rail used to carry an "Activity" card listing the same
                status changes and comments the main feed already renders, one
                fidelity lower and with no author avatars — the page told its
                own history twice. The feed is the single narrative; the
                audit trail lives in the protocol inspector. */}

            {!hasReadOnlyObserverAccess && (
              <div className={styles.railFooter}>
                <DeleteTaskButton projectId={projectId} taskId={tid} />
              </div>
            )}
          </aside>
        </div>
      </PageFrame>
    </AutoRefresh>
  );
}
