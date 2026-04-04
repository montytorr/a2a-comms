import { createServerClient } from '@/lib/supabase/server';
import type { AuthUser } from '@/lib/auth-context';

export type NotificationKind =
  | 'contract-invitation'
  | 'task-assigned'
  | 'project-invitation'
  | 'approval-request';

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
  approvals: number;
}

export interface DashboardNotificationSummary {
  counts: DashboardNotificationCounts;
  items: DashboardNotificationItem[];
}

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

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

type ApprovalRow = {
  id: string;
  action: string;
  actor: string;
  created_at: string;
};

export async function getDashboardNotificationSummary(user: AuthUser): Promise<DashboardNotificationSummary> {
  const supabase = createServerClient();
  const agentScope = user.agentIds.length > 0 ? user.agentIds : [EMPTY_UUID];

  const [contractInvitesRes, assignedTasksRes, projectInvitesRes, approvalsRes] = await Promise.all([
    supabase
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
    supabase
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
    supabase
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
    user.isSuperAdmin
      ? supabase
          .from('pending_approvals')
          .select('id, action, actor, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
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

  const projectItems: DashboardNotificationItem[] = projectInvites.map((row) => ({
    id: `project-${row.id}`,
    kind: 'project-invitation' as const,
    title: 'Project invitation',
    body: row.project?.title || 'A project invitation needs your response',
    href: row.project?.id ? `/projects/${row.project.id}?inbox=needs-response` : '/projects?inbox=needs-response',
    createdAt: row.created_at,
    meta: 'Awaiting response',
  }));

  const approvalItems: DashboardNotificationItem[] = approvals.map((row) => ({
    id: `approval-${row.id}`,
    kind: 'approval-request' as const,
    title: 'Approval requested',
    body: `${row.action} requested by ${row.actor}`,
    href: '/approvals',
    createdAt: row.created_at,
    meta: 'Sensitive action pending review',
  }));

  const items = [...contractItems, ...taskItems, ...projectItems, ...approvalItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);

  const counts: DashboardNotificationCounts = {
    contracts: contractItems.length,
    projects: taskItems.length + projectItems.length,
    approvals: approvalItems.length,
    total: contractItems.length + taskItems.length + projectItems.length + approvalItems.length,
  };

  return { counts, items };
}
