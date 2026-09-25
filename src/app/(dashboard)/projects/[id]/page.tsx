import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/db/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import ProjectTaskList, { type TaskRow } from './project-task-list';
import ProjectHeader, { EditableProjectDescription } from './project-header';
import AutoRefresh from '@/components/auto-refresh';
import type { ProjectInvitationStatus } from '@/lib/types';
import { hydrateProjectInvitations } from '@/app/api/v1/projects/_helpers';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import { applyProjectInvitationVisibility } from '@/lib/project-invitation-visibility';
import { normalizeProjectPrivacyMetadata } from '@/lib/privacy-policy';
import ProjectPrivacyControls from './privacy-controls';
import { BLOCKER_TONE, pillClassForTone } from '@/lib/status-tone';
import { PageFrame } from '@/components/atoms';
import styles from './project-detail.module.css';
export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const { id } = await params;

  const db = createServerClient();
  noStore();

  // Fetch project
  const { data: project, error } = await db
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !project) notFound();

  const inviteeScopedQuery = auth.agentScope;
  const projectPrivacy = normalizeProjectPrivacyMetadata(project.privacy_metadata);

  // Verify access: admin, member, observer, or invitee with an outstanding/resolved invitation.
  if (!user.isSuperAdmin) {
    const [{ data: membership }, { data: observerAccess }, { data: invitationAccess }] = await Promise.all([
      db
        .from('project_members')
        .select('id')
        .eq('project_id', id)
        .in('agent_id', inviteeScopedQuery)
        .limit(1),
      db
        .from('project_observers')
        .select('id')
        .eq('project_id', id)
        .in('agent_id', inviteeScopedQuery)
        .limit(1),
      db
        .from('project_member_invitations')
        .select('id')
        .eq('project_id', id)
        .in('agent_id', inviteeScopedQuery)
        .in('status', ['pending', 'accepted'])
        .limit(1),
    ]);

    if ((!membership || membership.length === 0) && (!observerAccess || observerAccess.length === 0) && (!invitationAccess || invitationAccess.length === 0)) {
      redirect('/projects');
    }
  }

  // Determine if user is project owner
  let isOwner = user.isSuperAdmin;
  const isObserver = !user.isSuperAdmin && !isOwner && !!(await db
    .from('project_observers')
    .select('id')
    .eq('project_id', id)
    .in('agent_id', auth.agentScope)
    .limit(1)).data?.length;
  if (!isOwner) {
    const { data: ownerCheck } = await db
      .from('project_members')
      .select('id, role')
      .eq('project_id', id)
      .eq('role', 'owner')
      .in('agent_id', auth.agentScope)
      .limit(1);
    isOwner = !!(ownerCheck && ownerCheck.length > 0);
  }

  // Fetch members, invitations, observers, ALL tasks (for completion %), filtered tasks, dependencies, and available agents in parallel
  const [membersRes, invitationsRes, observersRes, tasksRes, depsRes, allAgentsRes] = await Promise.all([
    db
      .from('project_members')
      .select('*, agent:agents(id, name, display_name)')
      .eq('project_id', id)
      .order('joined_at', { ascending: true }),
    db
      .from('project_member_invitations')
      .select('*, agent:agents!project_member_invitations_agent_id_fkey(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    // The observer MANAGER is gone (project_observers has never had a row), but
    // these still drive visibility: observerAgentIds below decides what a
    // member can see.
    db
      .from('project_observers')
      .select('*, agent:agents!project_observers_agent_id_fkey(id, name, display_name, trust_tier)')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    db
      .from('tasks')
      .select('id, project_id, title, status, priority, labels, assignee_agent_id, position, due_date, created_at, updated_at, blocked_at, blocker_follow_up_at, blocker_followed_through_at, blocker_escalated_at, blocker_resolution_action, blocker_resolution_owner, blocker_resolution_due_at, blocker_resolution_status, assignee:agents!tasks_assignee_agent_id_fkey(id, name, display_name)')
      .eq('project_id', id)
      .order('position', { ascending: true }),
    (async () => {
      const taskIdsRes = await db
        .from('tasks')
        .select('id')
        .eq('project_id', id);
      const projectTaskIds = (taskIdsRes.data || []).map((t: { id: string }) => t.id);
      if (projectTaskIds.length === 0) return { data: [], error: null };
      return db
        .from('task_dependencies')
        .select('id, blocking_task_id, blocked_task_id, dependency_type, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status), blocked_task:tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id, assignee_agent_id, updated_at, blocked_at, blocker_follow_up_at, blocker_followed_through_at, blocker_escalated_at, blocker_resolution_action, blocker_resolution_owner, blocker_resolution_due_at, blocker_resolution_status)')
        .or(`blocked_task_id.in.(${projectTaskIds.join(',')}),blocking_task_id.in.(${projectTaskIds.join(',')})`)
        .limit(500);
    })(),
    db.from('agents').select('id, name, display_name').order('name'),
  ]);

  const members = membersRes.data || [];
  const hydratedInvitations = await hydrateProjectInvitations(invitationsRes.data || []);
  const invitationVisibility = applyProjectInvitationVisibility(hydratedInvitations, {
    trust_tier: auth.trustTier,
    trust_policy: auth.trustPolicy,
  }, {
    treatAsObserver: isObserver,
    includeObserverSummary: true,
  });
  const invitations = invitationVisibility.visibleInvitations;
  const observers = observersRes.data || [];
  // Spelled out so the select above and what the board reads are checked
  // against each other: casting the mapped rows straight to `TaskRow[]` hid a
  // select that fetched neither due_date nor any blocker_* column, so no card
  // was ever overdue and every blocked card claimed it had no unblock plan.
  type TaskSelectRow = {
    id: string;
    project_id: string;
    title: string;
    status: string;
    priority: string;
    labels: string[];
    assignee_agent_id: string | null;
    position: number;
    due_date: string | null;
    created_at: string;
    updated_at: string;
    blocked_at: string | null;
    blocker_follow_up_at: string | null;
    blocker_followed_through_at: string | null;
    blocker_escalated_at: string | null;
    blocker_resolution_action: string | null;
    blocker_resolution_owner: string | null;
    blocker_resolution_due_at: string | null;
    blocker_resolution_status: string | null;
    assignee: { id: string; name: string; display_name: string } | { id: string; name: string; display_name: string }[] | null;
  };
  const tasks: TaskRow[] = ((tasksRes.data || []) as TaskSelectRow[]).map((task) => ({
    ...task,
    assignee: Array.isArray(task.assignee) ? (task.assignee[0] ?? null) : task.assignee,
  }));
  const allAgents = allAgentsRes.data || [];
  const dependencyRows = (depsRes.data || []) as Array<{
    id: string;
    blocking_task_id: string;
    blocked_task_id: string;
    dependency_type?: string;
    blocking_task: { id: string; title: string; status: string } | { id: string; title: string; status: string }[] | null;
    blocked_task: { id: string; title: string; status: string; project_id: string; assignee_agent_id: string | null; updated_at: string; blocked_at?: string | null; blocker_follow_up_at?: string | null; blocker_followed_through_at?: string | null; blocker_escalated_at?: string | null; blocker_resolution_action?: string | null; blocker_resolution_owner?: string | null; blocker_resolution_due_at?: string | null; blocker_resolution_status?: string | null } | { id: string; title: string; status: string; project_id: string; assignee_agent_id: string | null; updated_at: string; blocked_at?: string | null; blocker_follow_up_at?: string | null; blocker_followed_through_at?: string | null; blocker_escalated_at?: string | null; blocker_resolution_action?: string | null; blocker_resolution_owner?: string | null; blocker_resolution_due_at?: string | null; blocker_resolution_status?: string | null }[] | null;
  }>;

  // Available agents = all agents minus current members and pending invitees
  const memberAgentIds = new Set(members.map((m: { agent_id?: string; agent?: { id: string } | null }) => m.agent?.id).filter(Boolean));
  const observerAgentIds = new Set(observers.map((observer: { agent_id?: string; agent?: { id: string } | null }) => observer.agent?.id).filter(Boolean));
  const pendingInviteAgentIds = new Set(
    invitations
      .filter((inv: { status: ProjectInvitationStatus }) => inv.status === 'pending')
      .map((inv: { agent_id: string }) => inv.agent_id)
  );
  const availableAgents = allAgents.filter((a: { id: string }) => !memberAgentIds.has(a.id) && !observerAgentIds.has(a.id) && !pendingInviteAgentIds.has(a.id));

  const myPendingInvitations = invitations.filter((inv: { agent_id: string; status: ProjectInvitationStatus }) => (
    inv.status === 'pending' && auth.agentScope.includes(inv.agent_id)
  ));

  if (isObserver && !projectPrivacy.allow_observer_access) redirect('/projects');

  const projectDependencySummary = dependencyRows
    .map((dep) => ({
      ...dep,
      blocking_task: Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task,
      blocked_task: Array.isArray(dep.blocked_task) ? dep.blocked_task[0] ?? null : dep.blocked_task,
    }))
    .filter((dep) => dep.blocked_task?.project_id === id)
    .reduce((acc, dep) => {
      const blocked = dep.blocked_task;
      const blocking = dep.blocking_task;
      if (!blocked || !blocking) return acc;
      const existing = acc.get(blocked.id) || {
        blockedBy: [] as Array<{ id: string; title: string; status: string }>,
        blocks: [] as Array<{ id: string; title: string; status: string }>,
        sequenceAfter: [] as Array<{ id: string; title: string; status: string }>,
        sequenceBefore: [] as Array<{ id: string; title: string; status: string }>,
        related: [] as Array<{ id: string; title: string; status: string }>,
      };

      if (dep.dependency_type === 'blocks') {
        if (blocking.status !== 'done' && blocking.status !== 'cancelled') {
          existing.blockedBy.push({ id: blocking.id, title: blocking.title, status: blocking.status });
        }
        const blockingExisting = acc.get(blocking.id) || {
          blockedBy: [] as Array<{ id: string; title: string; status: string }>,
          blocks: [] as Array<{ id: string; title: string; status: string }>,
          sequenceAfter: [] as Array<{ id: string; title: string; status: string }>,
          sequenceBefore: [] as Array<{ id: string; title: string; status: string }>,
          related: [] as Array<{ id: string; title: string; status: string }>,
        };
        blockingExisting.blocks.push({ id: blocked.id, title: blocked.title, status: blocked.status });
        acc.set(blocking.id, blockingExisting);
      } else if (dep.dependency_type === 'sequence_after') {
        existing.sequenceAfter.push({ id: blocking.id, title: blocking.title, status: blocking.status });
        const blockingExisting = acc.get(blocking.id) || {
          blockedBy: [] as Array<{ id: string; title: string; status: string }>,
          blocks: [] as Array<{ id: string; title: string; status: string }>,
          sequenceAfter: [] as Array<{ id: string; title: string; status: string }>,
          sequenceBefore: [] as Array<{ id: string; title: string; status: string }>,
          related: [] as Array<{ id: string; title: string; status: string }>,
        };
        blockingExisting.sequenceBefore.push({ id: blocked.id, title: blocked.title, status: blocked.status });
        acc.set(blocking.id, blockingExisting);
      } else if (dep.dependency_type === 'relates_to') {
        existing.related.push({ id: blocking.id, title: blocking.title, status: blocking.status });
        const blockingExisting = acc.get(blocking.id) || {
          blockedBy: [] as Array<{ id: string; title: string; status: string }>,
          blocks: [] as Array<{ id: string; title: string; status: string }>,
          sequenceAfter: [] as Array<{ id: string; title: string; status: string }>,
          sequenceBefore: [] as Array<{ id: string; title: string; status: string }>,
          related: [] as Array<{ id: string; title: string; status: string }>,
        };
        blockingExisting.related.push({ id: blocked.id, title: blocked.title, status: blocked.status });
        acc.set(blocking.id, blockingExisting);
      }

      acc.set(blocked.id, existing);
      return acc;
    }, new Map<string, { blockedBy: Array<{ id: string; title: string; status: string }>; blocks: Array<{ id: string; title: string; status: string }>; sequenceAfter: Array<{ id: string; title: string; status: string }>; sequenceBefore: Array<{ id: string; title: string; status: string }>; related: Array<{ id: string; title: string; status: string }> }>());

  const tasksWithDependencySummary = tasks.map((task) => ({
    ...task,
    dependencySummary: projectDependencySummary.get(task.id) || undefined,
  }));

  const blockedTaskCardMap = dependencyRows
    .map((dep) => ({
      ...dep,
      blocking_task: Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task,
      blocked_task: Array.isArray(dep.blocked_task) ? dep.blocked_task[0] ?? null : dep.blocked_task,
    }))
    .filter((dep) => dep.dependency_type === 'blocks')
    .filter((dep) => dep.blocked_task?.project_id === id)
    .filter((dep) => dep.blocking_task && dep.blocking_task.status !== 'done' && dep.blocking_task.status !== 'cancelled')
    .reduce((acc, dep) => {
      const blocked = dep.blocked_task;
      const blocking = dep.blocking_task;
      if (!blocked || !blocking) return acc;
      const existing = acc.get(blocked.id) || {
        id: blocked.id,
        title: blocked.title,
        status: blocked.status,
        assignee_agent_id: blocked.assignee_agent_id,
        updated_at: blocked.updated_at,
        blocked_at: blocked.blocked_at ?? null,
        blocker_follow_up_at: blocked.blocker_follow_up_at ?? null,
        blocker_followed_through_at: blocked.blocker_followed_through_at ?? null,
        blocker_escalated_at: blocked.blocker_escalated_at ?? null,
        blocker_resolution_action: blocked.blocker_resolution_action ?? null,
        blocker_resolution_owner: blocked.blocker_resolution_owner ?? null,
        blocker_resolution_due_at: blocked.blocker_resolution_due_at ?? null,
        blocker_resolution_status: blocked.blocker_resolution_status ?? null,
        blockers: [] as Array<{ id: string; title: string; status: string }>,
      };
      existing.blockers.push({ id: blocking.id, title: blocking.title, status: blocking.status });
      acc.set(blocked.id, existing);
      return acc;
    }, new Map<string, { id: string; title: string; status: string; assignee_agent_id: string | null; updated_at: string; blocked_at: string | null; blocker_follow_up_at: string | null; blocker_followed_through_at: string | null; blocker_escalated_at: string | null; blocker_resolution_action: string | null; blocker_resolution_owner: string | null; blocker_resolution_due_at: string | null; blocker_resolution_status: string | null; blockers: Array<{ id: string; title: string; status: string }> }>());

  const blockedTaskCards = Array.from(blockedTaskCardMap.values())
    .filter((task) => ['todo', 'in-progress', 'in-review'].includes(task.status))
    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());

  return (
    <AutoRefresh intervalMs={15000} watch={['projects', 'tasks', 'contracts']}>
      <PageFrame width="wide">
        {/* Project Header */}
        <ProjectHeader
          project={{ ...project, privacy_metadata: projectPrivacy }}
          members={members}
          invitations={invitations}
          myPendingInvitations={myPendingInvitations}
          availableAgents={availableAgents}
          isOwner={isOwner}
          hiddenPendingInvitationCount={invitationVisibility.hiddenPendingCount}
          canSeeObserverInvitationSummary={invitationVisibility.canSeeSummary}
        />

        {blockedTaskCards.length > 0 && (
          <section className={`animate-fade-in ${styles.radar}`} aria-labelledby="blocker-radar-heading">
            <div className={styles.radarHead}>
              <h2 id="blocker-radar-heading" className={styles.radarTitle}>Blocker radar</h2>
              <p className={styles.radarSub}>Tasks waiting on other work, oldest first.</p>
              <span className={styles.radarCount}>
                {blockedTaskCards.length} blocked
              </span>
            </div>
            <div className={styles.radarList}>
              {blockedTaskCards.slice(0, 6).map((task) => {
                const state = getBlockedTaskNotificationState({
                  updatedAt: task.updated_at,
                  blockedAt: task.blocked_at,
                  blockerFollowUpAt: task.blocker_follow_up_at,
                  blockerFollowedThroughAt: task.blocker_followed_through_at,
                  blockerEscalatedAt: task.blocker_escalated_at,
                  blockerResolutionAction: task.blocker_resolution_action,
                  blockerResolutionOwner: task.blocker_resolution_owner,
                  blockerResolutionDueAt: task.blocker_resolution_due_at,
                  blockerResolutionStatus: task.blocker_resolution_status,
                  blockedByCount: task.blockers.length,
                  blockingTaskTitles: task.blockers.map((blocker) => blocker.title),
                });
                return (
                  <Link key={task.id} href={`/projects/${id}/tasks/${task.id}`} className={styles.radarRow}>
                    <span className={styles.radarRowMain}>
                      <span className={styles.radarRowTop}>
                        <span className={`${pillClassForTone(BLOCKER_TONE[state.tone])} text-2xs`} style={{ fontWeight: 600 }}>
                          {state.tone === 'stale' ? 'stale blocker' : state.tone === 'follow-through' ? 'follow-through due' : 'blocked'}
                        </span>
                        <span className={styles.radarTask}>{task.title}</span>
                      </span>
                      <span className={styles.radarMeta}>
                        Waiting on {task.blockers.map((blocker) => blocker.title).join(', ')}
                      </span>
                      {/* One line of plan, not two inset tiles repeating what
                          the task page already says in full. */}
                      <span className={styles.radarMeta}>
                        <b>{state.blockerResolutionOwner || 'No owner'}</b>
                        {' · '}
                        {state.blockerResolutionAction || 'no unblock plan logged'}
                        {state.dueStateLabel ? ` · ${state.dueStateLabel}` : ''}
                      </span>
                    </span>
                    <span className={styles.radarOpen}>Open →</span>
                  </Link>
                );
              })}
            </div>
            {blockedTaskCards.length > 6 && (
              <p className={styles.radarMore}>
                {blockedTaskCards.length - 6} more blocked task{blockedTaskCards.length - 6 === 1 ? '' : 's'} in the list below.
              </p>
            )}
          </section>
        )}

        {/* Context left, work right. The board used to take the full width
            and still hide a third of itself off-screen, while the project's
            own description sat in a 530px column with the rest of the page
            empty beside it. */}
        <div className={styles.workLayout}>
          <div className={styles.work}>
            <div className={styles.workHead}>
              <div>
                <h2>Tasks</h2>
                <p>{tasks.length} task{tasks.length === 1 ? '' : 's'} across the workflow</p>
              </div>
            </div>
            <ProjectTaskList
              tasks={tasksWithDependencySummary}
              projectId={id}
              members={members}
              canCreate={!isObserver}
            />
          </div>

          <aside className={styles.context} aria-label="Project context">
            {(project.description || isOwner) && (
              <section className={`card ${styles.aboutCard}`} aria-labelledby="project-about-heading">
                <h2 id="project-about-heading" className={styles.aboutTitle}>About</h2>
                <EditableProjectDescription value={project.description} projectId={id} isOwner={isOwner} />
              </section>
            )}
            <ProjectPrivacyControls
              projectId={id}
              initialPrivacy={projectPrivacy}
              canEdit={isOwner}
            />
          </aside>
        </div>
      </PageFrame>
    </AutoRefresh>
  );
}
