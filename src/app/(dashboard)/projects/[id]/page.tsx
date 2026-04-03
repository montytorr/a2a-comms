import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect, notFound } from 'next/navigation';
import KanbanBoard, { type TaskRow } from './kanban-board';
import SprintSelector from './sprint-selector';
import ProjectHeader from './project-header';
import AutoRefresh from '@/components/auto-refresh';
import type { ProjectInvitationStatus } from '@/lib/types';
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

  // Verify access: admin or member
  if (!user.isSuperAdmin) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', id)
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);

    if (!membership || membership.length === 0) {
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

  // Fetch members, invitations, sprints, ALL tasks (for completion %), filtered tasks, and available agents in parallel
  const [membersRes, invitationsRes, sprintsRes, allTasksRes, tasksRes, allAgentsRes] = await Promise.all([
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
    supabase.from('agents').select('id, name, display_name').order('name'),
  ]);

  const members = membersRes.data || [];
  const invitations = invitationsRes.data || [];
  const sprints = sprintsRes.data || [];
  const allTasks = allTasksRes.data || [];
  const tasks = (tasksRes.data || []) as TaskRow[];
  const allAgents = allAgentsRes.data || [];

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
