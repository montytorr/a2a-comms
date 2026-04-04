import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect, notFound } from 'next/navigation';
import KanbanBoard, { type TaskRow } from './kanban-board';
import SprintSelector from './sprint-selector';
import ProjectHeader from './project-header';
import AutoRefresh from '@/components/auto-refresh';
import type { ProjectInvitationStatus } from '@/lib/types';
import { hydrateProjectInvitations } from '@/app/api/v1/projects/_helpers';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sprint?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

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

  const inviteeScopedQuery = user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'];

  // Verify access: admin, member, or invitee with an outstanding/resolved invitation.
  if (!user.isSuperAdmin) {
    const [{ data: membership }, { data: invitationAccess }] = await Promise.all([
      supabase
        .from('project_members')
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

    if ((!membership || membership.length === 0) && (!invitationAccess || invitationAccess.length === 0)) {
      redirect('/projects');
    }
  }

  // Determine if user is project owner
  let isOwner = user.isSuperAdmin;
  if (!isOwner) {
    const { data: ownerCheck } = await supabase
      .from('project_members')
      .select('id, role')
      .eq('project_id', id)
      .eq('role', 'owner')
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);
    isOwner = !!(ownerCheck && ownerCheck.length > 0);
  }

  // Fetch members, invitations, sprints, ALL tasks (for completion %), filtered tasks, dependencies, and available agents in parallel
  const [membersRes, invitationsRes, sprintsRes, allTasksRes, tasksRes, depsRes, allAgentsRes] = await Promise.all([
    supabase
      .from('project_members')
      .select('*, agent:agents(id, name, display_name)')
      .eq('project_id', id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('project_member_invitations')
      .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
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
        .select('*, assignee:agents!tasks_assignee_agent_id_fkey(id, name, display_name)')
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
      .select('id, blocking_task_id, blocked_task_id, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status), blocked_task:tasks!task_dependencies_blocked_task_id_fkey(id, title, status, project_id, assignee_agent_id, updated_at)')
      .limit(500),
    supabase.from('agents').select('id, name, display_name').order('name'),
  ]);

  const members = membersRes.data || [];
  const invitations = await hydrateProjectInvitations(invitationsRes.data || []);
  const sprints = sprintsRes.data || [];
  const allTasks = allTasksRes.data || [];
  const tasks = (tasksRes.data || []) as TaskRow[];
  const allAgents = allAgentsRes.data || [];
  const dependencyRows = (depsRes.data || []) as Array<{
    id: string;
    blocking_task_id: string;
    blocked_task_id: string;
    blocking_task: { id: string; title: string; status: string } | { id: string; title: string; status: string }[] | null;
    blocked_task: { id: string; title: string; status: string; project_id: string; assignee_agent_id: string | null; updated_at: string } | { id: string; title: string; status: string; project_id: string; assignee_agent_id: string | null; updated_at: string }[] | null;
  }>;

  // Available agents = all agents minus current members and pending invitees
  const memberAgentIds = new Set(members.map((m: { agent_id?: string; agent?: { id: string } | null }) => m.agent?.id).filter(Boolean));
  const pendingInviteAgentIds = new Set(
    invitations
      .filter((inv: { status: ProjectInvitationStatus }) => inv.status === 'pending')
      .map((inv: { agent_id: string }) => inv.agent_id)
  );
  const availableAgents = allAgents.filter((a: { id: string }) => !memberAgentIds.has(a.id) && !pendingInviteAgentIds.has(a.id));

  const myPendingInvitations = invitations.filter((inv: { agent_id: string; status: ProjectInvitationStatus }) => (
    inv.status === 'pending' && user.agentIds.includes(inv.agent_id)
  ));

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

  const blockedTaskCardMap = dependencyRows
    .map((dep) => ({
      ...dep,
      blocking_task: Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task,
      blocked_task: Array.isArray(dep.blocked_task) ? dep.blocked_task[0] ?? null : dep.blocked_task,
    }))
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
        blockers: [] as Array<{ id: string; title: string; status: string }>,
      };
      existing.blockers.push({ id: blocking.id, title: blocking.title, status: blocking.status });
      acc.set(blocked.id, existing);
      return acc;
    }, new Map<string, { id: string; title: string; status: string; assignee_agent_id: string | null; updated_at: string; blockers: Array<{ id: string; title: string; status: string }> }>());

  const blockedTaskCards = Array.from(blockedTaskCardMap.values())
    .filter((task) => ['todo', 'in-progress', 'in-review'].includes(task.status))
    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());

  return (
    <AutoRefresh intervalMs={15000}>
      <div className="p-4 sm:p-6 lg:p-10">
        {/* Project Header */}
        <ProjectHeader
          project={project}
          members={members}
          invitations={invitations}
          myPendingInvitations={myPendingInvitations}
          availableAgents={availableAgents}
          isOwner={isOwner}
        />

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
                <h2 className="text-lg font-semibold text-white mt-1">Blocked tasks needing escalation</h2>
                <p className="text-[12px] text-gray-400 mt-1">Pulled from task dependencies so blocked work is visible before it fossilizes.</p>
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
          tasks={tasks}
          projectId={id}
          sprintId={sprintFilter && sprintFilter !== 'all' && sprintFilter !== 'backlog' ? sprintFilter : undefined}
          members={members}
        />
      </div>
    </AutoRefresh>
  );
}
