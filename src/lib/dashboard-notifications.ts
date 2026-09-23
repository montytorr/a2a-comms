import { createServerClient } from '@/lib/db/server';
import type { AuthUser } from '@/lib/auth-context';
import type { AuthActorContext } from '@/lib/auth-actor-context';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import type { PulseKey } from '@/lib/pulse';

export type NotificationKind =
  | 'contract-invitation'
  | 'task-assigned'
  | 'task-blocked'
  | 'task-blocked-stale'
  | 'task-blocked-follow-through'
  | 'project-invitation'
  | 'approval-request'
  | 'agent-question';

export interface DashboardNotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  meta?: string;
}

export interface DashboardNotificationCounts {
  total: number;
  contracts: number;
  projects: number;
  blockers: number;
  approvals: number;
  /** Agents on your contracts that have stopped and asked you something. */
  questions: number;
}

export interface DashboardNotificationSummary {
  counts: DashboardNotificationCounts;
  items: DashboardNotificationItem[];
}

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Every domain whose change can add or remove a notification. The page watches
 * these; missing one means the list goes stale for that category.
 */
export const NOTIFICATION_PULSE_KEYS = ['contracts', 'participants', 'tasks', 'projects', 'approvals'] as const satisfies readonly PulseKey[];

/**
 * The agents whose notifications count. The badge (via the API route) and the
 * page must resolve this identically, or they disagree whenever an acting agent
 * is selected.
 */
export const resolveNotificationAgentScope = (context: AuthUser | AuthActorContext): string[] => {
  if ('agentScope' in context) return context.agentScope.length > 0 ? context.agentScope : [EMPTY_UUID];
  return context.agentIds.length > 0 ? context.agentIds : [EMPTY_UUID];
};

export interface NotificationGroups {
  questions: DashboardNotificationItem[];
  blockers: DashboardNotificationItem[];
  contracts: DashboardNotificationItem[];
  tasks: DashboardNotificationItem[];
  projects: DashboardNotificationItem[];
  approvals: DashboardNotificationItem[];
}

/**
 * Counts and list from the same arrays, so every counted item is listed and
 * every listed item is counted. There is deliberately no truncation here: a
 * total the list cannot show is exactly the badge/page disagreement to avoid.
 */
export const buildNotificationSummary = (groups: NotificationGroups): DashboardNotificationSummary => {
  const items = [...groups.questions, ...groups.blockers, ...groups.contracts, ...groups.tasks, ...groups.projects, ...groups.approvals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    counts: {
      contracts: groups.contracts.length,
      projects: groups.tasks.length + groups.projects.length,
      blockers: groups.blockers.length,
      approvals: groups.approvals.length,
      questions: groups.questions.length,
      total: items.length,
    },
    items,
  };
};

type ContractInviteRow = {
  contract_id: string;
  created_at: string;
  contract: { id: string; title: string; status: string } | { id: string; title: string; status: string }[] | null;
};

type AssignedTaskRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  project: { id: string; title: string } | { id: string; title: string }[] | null;
};

type ProjectInviteRow = {
  id: string;
  created_at: string;
  project: { id: string; title: string } | { id: string; title: string }[] | null;
};

type BlockedTaskRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  blocked_at: string | null;
  blocker_follow_up_at: string | null;
  blocker_followed_through_at: string | null;
  blocker_escalated_at: string | null;
  blocker_resolution_action: string | null;
  blocker_resolution_owner: string | null;
  blocker_resolution_due_at: string | null;
  blocker_resolution_status: string | null;
  project_id: string;
  project: { id: string; title: string } | { id: string; title: string }[] | null;
  blocked_by: Array<{ blocking_task: { id: string; title: string; status: string } | { id: string; title: string; status: string }[] | null; dependency_type?: string }> | null;
};

type ApprovalRow = {
  id: string;
  action: string;
  actor: string;
  created_at: string;
};

export async function getDashboardNotificationSummary(context: AuthUser | AuthActorContext): Promise<DashboardNotificationSummary> {
  const db = createServerClient();
  const user = 'user' in context ? context.user : context;
  const agentScope = resolveNotificationAgentScope(context);

  const [contractInvitesRes, assignedTasksRes, projectInvitesRes, blockedTasksRes, approvalsRes, myContractRowsRes] = await Promise.all([
    db
      .from('contract_participants')
      .select(`
        contract_id,
        created_at,
        contract:contracts!contract_participants_contract_id_fkey(id, title, status)
      `)
      .in('agent_id', agentScope)
      .eq('role', 'invitee')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(25),
    db
      .from('tasks')
      .select(`
        id,
        title,
        status,
        updated_at,
        project:projects(id, title)
      `)
      .in('assignee_agent_id', agentScope)
      .in('status', ['todo', 'in-progress'])
      .order('updated_at', { ascending: false })
      .limit(25),
    db
      .from('project_member_invitations')
      .select(`
        id,
        created_at,
        project:projects(id, title)
      `)
      .in('agent_id', agentScope)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(25),
    db
      .from('tasks')
      .select(`
        id,
        title,
        status,
        updated_at,
        blocked_at,
        blocker_follow_up_at,
        blocker_followed_through_at,
        blocker_escalated_at,
        blocker_resolution_action,
        blocker_resolution_owner,
        blocker_resolution_due_at,
        blocker_resolution_status,
        project_id,
        project:projects(id, title),
        blocked_by:task_dependencies!task_dependencies_blocked_task_id_fkey(
          dependency_type,
          blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status)
        )
      `)
      .in('assignee_agent_id', agentScope)
      .in('status', ['todo', 'in-progress', 'in-review'])
      .order('updated_at', { ascending: false })
      .limit(25),
    user.isSuperAdmin
      ? db
          .from('pending_approvals')
          .select('id, action, actor, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
    // Fetch this alongside the notification fan-out. It is needed for the
    // question query below and must not add another serial round trip to the
    // shared dashboard layout.
    db
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', agentScope),
  ]);

  const contractInvites = ((contractInvitesRes.data || []) as unknown as ContractInviteRow[]).map((row) => ({
    ...row,
    contract: Array.isArray(row.contract) ? row.contract[0] ?? null : row.contract,
  }));
  const assignedTasks = ((assignedTasksRes.data || []) as unknown as AssignedTaskRow[]).map((row) => ({
    ...row,
    project: Array.isArray(row.project) ? row.project[0] ?? null : row.project,
  }));
  const projectInvites = ((projectInvitesRes.data || []) as unknown as ProjectInviteRow[]).map((row) => ({
    ...row,
    project: Array.isArray(row.project) ? row.project[0] ?? null : row.project,
  }));
  const blockedTasks = ((blockedTasksRes.data || []) as unknown as BlockedTaskRow[])
    .map((row) => ({
      ...row,
      project: Array.isArray(row.project) ? row.project[0] ?? null : row.project,
      blocked_by: (row.blocked_by || []).map((dep) => ({
        dependency_type: (dep as { dependency_type?: string }).dependency_type,
        blocking_task: Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task,
      })),
    }))
    .filter((row) => (row.blocked_by || []).some((dep) => dep.dependency_type === 'blocks' && dep.blocking_task && dep.blocking_task.status !== 'done' && dep.blocking_task.status !== 'cancelled'));
  const approvals = (approvalsRes.data || []) as unknown as ApprovalRow[];

  const contractItems: DashboardNotificationItem[] = contractInvites
    .filter((row) => row.contract && row.contract.status === 'proposed')
    .map((row) => ({
      id: `contract-${row.contract_id}`,
      kind: 'contract-invitation' as const,
      title: 'Contract invitation',
      body: row.contract?.title || 'A contract needs your response',
      href: `/contracts/${row.contract_id}`,
      createdAt: row.created_at,
      meta: 'Awaiting acceptance',
    }));

  const taskItems: DashboardNotificationItem[] = assignedTasks.map((row) => ({
    id: `task-${row.id}`,
    kind: 'task-assigned' as const,
    title: 'Assigned task',
    body: row.title,
    href: row.project?.id ? `/projects/${row.project.id}/tasks/${row.id}` : '/projects',
    createdAt: row.updated_at,
    meta: row.project?.title || row.status,
  }));

  const blockerItems: DashboardNotificationItem[] = blockedTasks.map((row) => {
    const activeBlockers = (row.blocked_by || [])
      .map((dep) => dep.blocking_task)
      .filter((_task, index) => (row.blocked_by || [])[index]?.dependency_type === 'blocks')
      .filter((task): task is { id: string; title: string; status: string } => !!task && task.status !== 'done' && task.status !== 'cancelled');
    const blockerState = getBlockedTaskNotificationState({
      updatedAt: row.updated_at,
      blockedAt: row.blocked_at,
      blockerFollowUpAt: row.blocker_follow_up_at,
      blockerFollowedThroughAt: row.blocker_followed_through_at,
      blockerEscalatedAt: row.blocker_escalated_at,
      blockerResolutionAction: row.blocker_resolution_action,
      blockerResolutionOwner: row.blocker_resolution_owner,
      blockerResolutionDueAt: row.blocker_resolution_due_at,
      blockerResolutionStatus: row.blocker_resolution_status,
      blockedByCount: activeBlockers.length,
      blockingTaskTitles: activeBlockers.map((task) => task.title),
    });

    const kind = blockerState.tone === 'stale'
      ? 'task-blocked-stale'
      : blockerState.tone === 'follow-through'
        ? 'task-blocked-follow-through'
        : 'task-blocked';

    const title = blockerState.tone === 'stale'
      ? 'Stale blocker needs escalation'
      : blockerState.tone === 'follow-through'
        ? 'Blocked task needs follow-through'
        : 'Blocked task';

    return {
      id: `blocked-${row.id}`,
      kind,
      title,
      body: row.title,
      href: row.project?.id ? `/projects/${row.project.id}/tasks/${row.id}` : `/projects/${row.project_id}/tasks/${row.id}`,
      createdAt: row.updated_at,
      meta: `${row.project?.title || row.status} · ${blockerState.meta} · ${blockerState.planSummary}`,
    };
  });

  const projectItems: DashboardNotificationItem[] = projectInvites.map((row) => ({
    id: `project-${row.id}`,
    kind: 'project-invitation' as const,
    title: 'Project invitation',
    body: row.project?.title || 'A project invitation needs your response',
    href: row.project?.id ? `/projects/${row.project.id}?inbox=needs-response` : '/projects?inbox=needs-response',
    createdAt: row.created_at,
    meta: 'Awaiting response',
  }));

  // Questions agents have put to a person on contracts this user is on. Two
  // steps rather than an embedded filter: the question is addressed to whoever
  // can answer it, which is every human on the contract and not only the owner
  // of the agent that asked.
  const myContractIds = [...new Set((((myContractRowsRes.data || []) as Array<{ contract_id: string }>)).map((row) => row.contract_id))];

  const { data: questionRows } = myContractIds.length > 0
    ? await db
        .from('contract_questions')
        .select('id, contract_id, kind, body, blocking, created_at, agent:agents!asked_by_agent_id(name, display_name), contract:contracts!contract_id(title)')
        .eq('status', 'open')
        .in('contract_id', myContractIds)
        .order('created_at', { ascending: false })
        .limit(25)
    : { data: [] };

  const questionItems: DashboardNotificationItem[] = ((questionRows || []) as Array<{
    id: string; contract_id: string; kind: string; body: string; blocking: boolean; created_at: string;
    agent?: { name?: string | null; display_name?: string | null } | Array<{ name?: string | null; display_name?: string | null }>;
    contract?: { title?: string | null } | Array<{ title?: string | null }>;
  }>).map((row) => {
    const agent = Array.isArray(row.agent) ? row.agent[0] : row.agent;
    const contract = Array.isArray(row.contract) ? row.contract[0] : row.contract;
    const who = agent?.display_name || agent?.name || 'An agent';
    return {
      id: `question-${row.id}`,
      kind: 'agent-question' as const,
      title: row.blocking ? `${who} is blocked and asking you` : `${who} has a question`,
      body: contract?.title ? `${row.body} — on "${contract.title}"` : row.body,
      href: `/contracts/${row.contract_id}`,
      createdAt: row.created_at,
      meta: row.blocking ? 'Nothing moves until you answer' : `Awaiting your ${row.kind === 'validation' ? 'validation' : 'answer'}`,
    };
  });

  const approvalItems: DashboardNotificationItem[] = approvals.map((row) => ({
    id: `approval-${row.id}`,
    kind: 'approval-request' as const,
    title: 'Approval requested',
    body: `${row.action} requested by ${row.actor}`,
    href: '/approvals',
    createdAt: row.created_at,
    meta: 'Sensitive action pending review',
  }));

  return buildNotificationSummary({
    questions: questionItems,
    blockers: blockerItems,
    contracts: contractItems,
    tasks: taskItems,
    projects: projectItems,
    approvals: approvalItems,
  });
}
