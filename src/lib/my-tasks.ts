import { createServerClient } from '@/lib/db/server';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import type { AuthActorContext } from '@/lib/auth-actor-context';
import type { TaskStatus } from '@/lib/types';

/**
 * Tasks across every project, rather than within one.
 *
 * The dashboard could only ever answer "what is assigned to me" indirectly,
 * as rows on /notifications — there was no route that listed work across
 * projects, so anything not currently nagging you was reachable only by
 * remembering which project it lived in.
 */
/**
 * The statuses a task can actually hold.
 *
 * This declared its own list including `blocked`, which the `tasks.status`
 * CHECK has never permitted — so the /tasks filter offered an option that could
 * not match a row — while omitting `backlog` and `in-review`, which are real.
 * Aliasing TaskStatus means the database, the filter and the default view
 * cannot drift apart again.
 */

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

/**
 * Statuses that count as live work, used as the default view.
 *
 * The default work queue includes work waiting to start and work underway.
 * In-review remains available as a focused filter once a reviewer wants it.
 */
export const OPEN_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in-progress'];

/**
 * Who a task query is allowed to see, decided before any query is built.
 *
 * This lived inline as `if (!isSuperAdmin && scope.projectIds.length > 0)`,
 * which inverted the guard exactly when it mattered: a user whose scope was
 * EMPTY skipped the project filter altogether, and `/tasks` listed every task
 * in every project. An empty scope means "sees nothing", not "sees
 * everything". It is a pure function so the rule can be tested without a
 * database — the inline version never could be.
 */
export function resolveTaskQueryScope(input: {
  isSuperAdmin: boolean;
  projectIds: string[];
  agentIds: string[];
  assignee?: MyTaskFilters['assignee'];
}): { visible: boolean; projectIds: string[] | null; agentIds: string[] | null } {
  const filterByAssignee = input.assignee !== 'all';

  if (!input.isSuperAdmin && input.projectIds.length === 0) {
    return { visible: false, projectIds: null, agentIds: null };
  }

  if (filterByAssignee && input.agentIds.length === 0) {
    return { visible: false, projectIds: null, agentIds: null };
  }

  return {
    visible: true,
    // A super admin is bounded by nothing; everyone else by their scope.
    projectIds: input.isSuperAdmin ? null : input.projectIds,
    agentIds: filterByAssignee ? input.agentIds : null,
  };
}

export async function listMyTasks(auth: AuthActorContext, filters: MyTaskFilters = {}) {
  const db = createServerClient();
  const scope = await buildDashboardVisibilityScope(auth);
  const limit = filters.limit ?? 200;
  const visibility = resolveTaskQueryScope({
    isSuperAdmin: auth.user.isSuperAdmin,
    projectIds: scope.projectIds,
    agentIds: scope.agentIds,
    assignee: filters.assignee,
  });

  let query = db
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

  if (!visibility.visible) {
    return { tasks: [] as MyTask[], error: null };
  }

  if (visibility.projectIds) query = query.in('project_id', visibility.projectIds);
  if (visibility.agentIds) query = query.in('assignee_agent_id', visibility.agentIds);

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
