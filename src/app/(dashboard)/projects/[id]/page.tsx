import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import KanbanBoard, { type TaskRow } from './kanban-board';
import SprintSelector from './sprint-selector';
import ProjectHeader from './project-header';
import AutoRefresh from '@/components/auto-refresh';
import type { ProjectInvitationStatus } from '@/lib/types';
import { hydrateProjectInvitations } from '@/app/api/v1/projects/_helpers';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import { applyProjectInvitationVisibility } from '@/lib/project-invitation-visibility';
import { normalizeProjectPrivacyMetadata } from '@/lib/privacy-policy';
import ProjectPrivacyControls from './privacy-controls';
export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sprint?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const { id } = await params;
  const { sprint: sprintFilter } = await searchParams;
  const supabase = createServerClient();
  noStore();

  // Fetch project
  const { data: project, error } = await supabase
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
      supabase
        .from('project_members')
        .select('id')
        .eq('project_id', id)
        .in('agent_id', inviteeScopedQuery)
        .limit(1),
      supabase
        .from('project_observers')
        .select('id')
        .eq('project_id', id)
        .in('agent_id', inviteeScopedQuery)
        .limit(1),
      supabase
        .from('project_member_invitations')
        .select('id')
        .eq('project_id', id)
        .in('agent_id', inviteeScopedQuery)
        .limit(1),
    ]);

    if ((!membership || membership.length === 0) && (!observerAccess || observerAccess.length === 0) && (!invitationAccess || invitationAccess.length === 0)) {
      redirect('/projects');
    }
  }

  // Determine if user is project owner
  let isOwner = user.isSuperAdmin;
  const isObserver = !user.isSuperAdmin && !isOwner && !!(await supabase
    .from('project_observers')
    .select('id')
    .eq('project_id', id)
    .in('agent_id', auth.agentScope)
    .limit(1)).data?.length;
  if (!isOwner) {
    const { data: ownerCheck } = await supabase
      .from('project_members')
      .select('id, role')
      .eq('project_id', id)
      .eq('role', 'owner')
      .in('agent_id', auth.agentScope)
      .limit(1);
    isOwner = !!(ownerCheck && ownerCheck.length > 0);
  }

  // Fetch members, invitations, observers, sprints, ALL tasks (for completion %), filtered tasks, dependencies, and available agents in parallel
  const [membersRes, invitationsRes, observersRes, sprintsRes, allTasksRes, tasksRes, depsRes, allAgentsRes] = await Promise.all([
    supabase
      .from('project_members')
      .select('*, agent:agents(id, name, display_name)')
      .eq('project_id', id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('project_member_invitations')
      .select('*, agent:agents!project_member_invitations_agent_id_fkey(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_observers')
      .select('*, agent:agents!project_observers_agent_id_fkey(id, name, display_name, trust_tier), invited_by:agents!project_observers_invited_by_agent_id_fkey(id, name, display_name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('sprints')
      .select('*')
      .eq('project_id', id)
      .order('position', { ascending: true }),
    supabase
      .from('tasks')
      .select('id, sprint_id, status')
      .eq('project_id', id),
    (() => {
      let q = supabase
        .from('tasks')
        .select('id, project_id, title, status, priority, labels, assignee_agent_id, due_date, position, sprint_id, created_at, updated_at, blocked_at, blocker_follow_up_at, blocker_followed_through_at, blocker_escalated_at, blocker_resolution_action, blocker_resolution_owner, blocker_resolution_due_at, blocker_resolution_status, assignee:agents!tasks_assignee_agent_id_fkey(id, name, display_name)')
        .eq('project_id', id);

      if (sprintFilter && sprintFilter !== 'backlog') {
        q = q.eq('sprint_id', sprintFilter);
      } else if (sprintFilter === 'backlog') {
        q = q.is('sprint_id', null);
      }

      return q.order('position', { ascending: true });
    })(),
    supabase
      .from('task_dependencies')
      .select('id, blocking_task_id, blocked_task_id, dependency_type, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status), blocked_task:tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id, assignee_agent_id, updated_at, blocked_at, blocker_follow_up_at, blocker_followed_through_at, blocker_escalated_at, blocker_resolution_action, blocker_resolution_owner, blocker_resolution_due_at, blocker_resolution_status)')
      .limit(500),
    supabase.from('agents').select('id, name, display_name').order('name'),
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
  const sprints = sprintsRes.data || [];
  const allTasks = allTasksRes.data || [];
  const tasks = ((tasksRes.data || []) as Array<Record<string, unknown>>).map((task) => ({
    ...task,
    assignee: Array.isArray(task.assignee) ? (task.assignee[0] ?? null) : task.assignee,
  })) as TaskRow[];
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

  // Compute completion stats per sprint (excluding cancelled tasks)
  const sprintStats: Record<string, { total: number; done: number }> = {};
  for (const t of allTasks) {
    if (t.status === 'cancelled') continue; // Exclude cancelled from progress
    const key = t.sprint_id || 'backlog';
    if (!sprintStats[key]) sprintStats[key] = { total: 0, done: 0 };
    sprintStats[key].total++;
    if (t.status === 'done') sprintStats[key].done++;
  }
  // "all" = sum of everything (excluding cancelled)
  const nonCancelledTasks = allTasks.filter(t => t.status !== 'cancelled');
  sprintStats['all'] = { total: nonCancelledTasks.length, done: nonCancelledTasks.filter(t => t.status === 'done').length };

  // Get active sprint
  const activeSprint = sprints.find(s => s.status === 'active') || null;
  const currentSprintId = sprintFilter || (activeSprint?.id ?? 'all');

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
    <AutoRefresh intervalMs={15000}>
      <div className="mx-auto w-full max-w-[2240px] p-4 sm:p-6 lg:p-10">
        {/* Project Header */}
        <ProjectHeader
          project={{ ...project, privacy_metadata: projectPrivacy }}
          members={members}
          invitations={invitations}
          myPendingInvitations={myPendingInvitations}
          availableAgents={availableAgents}
          observers={observers as never[]}
          isOwner={isOwner}
          hiddenPendingInvitationCount={invitationVisibility.hiddenPendingCount}
          canSeeObserverInvitationSummary={invitationVisibility.canSeeSummary}
        />

        <div className="mb-6">
          <ProjectPrivacyControls
            projectId={id}
            initialPrivacy={projectPrivacy}
            canEdit={isOwner}
          />
        </div>

        {/* Sprint Selector */}
        <SprintSelector
          sprints={sprints}
          currentSprintId={currentSprintId}
          projectId={id}
          sprintStats={sprintStats}
        />

        {blockedTaskCards.length > 0 && (
          <div className="mb-6 rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-500/[0.08] via-amber-500/[0.04] to-transparent p-5 animate-fade-in">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-semibold text-red-300 uppercase tracking-[0.2em]">Blocker radar</p>
                <h2 className="text-lg font-semibold text-white mt-1">Blocked tasks with concrete unblock plans</h2>
                <p className="text-[12px] text-gray-400 mt-1">Pulled from task dependencies so blocker owner, next action, and timing stay visible at project level before work fossilizes.</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">{blockedTaskCards.length}</p>
                <p className="text-[11px] text-gray-500">active blockers</p>
              </div>
            </div>
            <div className="space-y-3">
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
                const toneClass = state.tone === 'stale'
                  ? 'border-red-500/20 bg-red-500/[0.10]'
                  : state.tone === 'follow-through'
                    ? 'border-amber-500/20 bg-amber-500/[0.08]'
                    : 'border-white/[0.06] bg-white/[0.03]';
                return (
                  <Link
                    key={task.id}
                    href={`/projects/${id}/tasks/${task.id}`}
                    className={`block rounded-xl border px-4 py-3 transition-colors hover:bg-white/[0.05] ${toneClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="inline-flex items-center rounded-full border border-red-500/20 bg-red-500/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                            {state.tone === 'stale' ? 'stale blocker' : state.tone === 'follow-through' ? 'follow-through due' : 'blocked'}
                          </span>
                          <span className="text-[11px] text-gray-500">{state.meta}</span>
                        </div>
                        <p className="text-sm font-semibold text-white">{task.title}</p>
                        <p className="text-[12px] text-gray-400 mt-1">Waiting on {task.blockers.map((blocker) => blocker.title).join(', ')}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border border-white/[0.06] bg-black/15 px-2.5 py-2">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">Owner</p>
                            <p className="mt-1 text-[12px] text-gray-200">{state.blockerResolutionOwner || 'Unassigned'}</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-black/15 px-2.5 py-2">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">Expected follow-up</p>
                            <p className="mt-1 text-[12px] text-gray-200">{state.blockerResolutionDueAt ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(state.blockerResolutionDueAt)) + ' UTC' : 'Not scheduled'}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[12px] text-gray-300 line-clamp-2">{state.blockerResolutionAction || 'No unblock plan logged yet'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-gray-300">{state.statusLabel}</span>
                          {state.dueStateLabel && (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${state.dueState === 'overdue' ? 'border-red-500/20 bg-red-500/[0.12] text-red-200' : state.dueState === 'due-soon' ? 'border-amber-500/20 bg-amber-500/[0.12] text-amber-200' : 'border-cyan-500/20 bg-cyan-500/[0.1] text-cyan-200'}`}>{state.dueStateLabel}</span>
                          )}
                          {state.escalationLabel && (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${state.blockerEscalatedAt ? 'border-red-500/20 bg-red-500/[0.12] text-red-200' : 'border-red-500/20 bg-red-500/[0.08] text-red-300'}`}>{state.escalationLabel}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-cyan-400 shrink-0">Open →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Kanban Board */}
        <KanbanBoard
          tasks={tasksWithDependencySummary}
          projectId={id}
          sprintId={sprintFilter && sprintFilter !== 'all' && sprintFilter !== 'backlog' ? sprintFilter : undefined}
          members={members}
        />
      </div>
    </AutoRefresh>
  );
}
