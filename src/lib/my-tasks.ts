import { createServerClient } from '@/lib/supabase/server';
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
export type MyTaskStatus = TaskStatus;

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
 * `in-review` is live work — it is waiting on a person, which is the most
 * actionable a task gets — and it was missing, so a task in review never
 * appeared in "my open tasks". `backlog` was missing too, hiding everything not
 * yet started. The old list spent its third slot on `blocked`, a status no task
 * can hold.
 */
export const OPEN_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in-progress', 'in-review'];

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
