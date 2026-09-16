import { createServerClient } from '@/lib/supabase/server';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import type { AuthActorContext } from '@/lib/auth-actor-context';

/**
 * Tasks across every project, rather than within one.
 *
 * The dashboard could only ever answer "what is assigned to me" indirectly,
 * as rows on /notifications — there was no route that listed work across
 * projects, so anything not currently nagging you was reachable only by
 * remembering which project it lived in.
 */
export type MyTaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done' | 'cancelled';

export interface MyTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  updated_at: string;
  labels: string[] | null;
  assignee_agent_id: string | null;
  project: { id: string; title: string } | null;
  assignee: { id: string; name: string; display_name: string | null } | null;
}

export interface MyTaskFilters {
  status?: string;
  projectId?: string;
  /** 'me' restricts to the acting agent scope; 'all' drops the assignee filter. */
  assignee?: 'me' | 'all';
  limit?: number;
}

/** Statuses that count as live work, used as the default view. */
export const OPEN_STATUSES = ['todo', 'in-progress', 'blocked'];

export async function listMyTasks(auth: AuthActorContext, filters: MyTaskFilters = {}) {
  const supabase = createServerClient();
  const scope = await buildDashboardVisibilityScope(auth);
  const limit = filters.limit ?? 200;

  let query = supabase
    .from('tasks')
    .select(`
      id,
      title,
      status,
      priority,
      due_date,
      updated_at,
      labels,
      assignee_agent_id,
      project:projects(id, title),
      assignee:agents!assignee_agent_id(id, name, display_name)
    `)
    .order('updated_at', { ascending: false })
    .limit(limit);

  // A super admin sees every project; everyone else is bounded by the same
  // visibility scope the rest of the dashboard uses.
  if (!auth.user.isSuperAdmin && scope.projectIds.length > 0) {
    query = query.in('project_id', scope.projectIds);
  }

  if (filters.assignee !== 'all') {
    query = query.in('assignee_agent_id', scope.agentIds);
  }

  if (filters.projectId) query = query.eq('project_id', filters.projectId);

  if (filters.status && filters.status !== 'open' && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  } else if (filters.status !== 'all') {
    query = query.in('status', OPEN_STATUSES);
  }

  const { data, error } = await query;
  if (error) return { tasks: [] as MyTask[], error: error.message };
  return { tasks: (data ?? []) as unknown as MyTask[], error: null };
}
