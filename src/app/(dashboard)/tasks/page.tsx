import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { ListChecks, AlertTriangle } from 'lucide-react';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { listMyTasks } from '@/lib/my-tasks';
import { createServerClient } from '@/lib/db/server';
import { PageFrame, SectionHeader, EmptyState } from '@/components/atoms';
import AutoRefresh from '@/components/auto-refresh';
import TaskList, { type TaskListRow } from '@/components/task-list';
import TaskFilters from './filters';

export const dynamic = 'force-dynamic';


export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; project?: string; assignee?: string }>;
}) {
  const auth = await getAuthActorContext();
  if (!auth?.user) redirect('/login');

  const params = await searchParams;
  noStore();

  const [{ tasks, error }, projectList] = await Promise.all([
    listMyTasks(auth, {
      status: params.status,
      projectId: params.project,
      assignee: params.assignee === 'me' ? 'me' : 'all',
    }),
    createServerClient()
      .from('projects')
      .select('id, title')
      .order('title', { ascending: true })
      .limit(200),
  ]);

  const projects = (projectList.data ?? []) as unknown as Array<{ id: string; title: string }>;
  const scopeLabel = params.assignee === 'me' ? 'Assigned to you' : 'Everyone';
  const projectLabel = params.project
    ? projects.find((project) => project.id === params.project)?.title || 'Selected project'
    : 'All projects';
  const statusLabel = !params.status || params.status === 'open'
    ? 'Backlog, to do & in progress'
    : ({
      all: 'Every status',
      backlog: 'Backlog',
      todo: 'To do',
      'in-progress': 'In progress',
      'in-review': 'In review',
      done: 'Done',
      cancelled: 'Cancelled',
    } as Record<string, string>)[params.status] || params.status;

  return (
    <AutoRefresh intervalMs={30000} watch={['tasks', 'projects']}>
      <PageFrame>
        <SectionHeader
          eyebrow="Delivery"
          title="Tasks"
          sub={`${scopeLabel} · ${projectLabel} · ${statusLabel} · ${tasks.length} shown`}
        />

        <TaskFilters projects={projects} />

        {error && (
          <div className="card" style={{ marginTop: 16, borderColor: 'var(--rose-line)' }}>
            <EmptyState
              tone="error"
              icon={<AlertTriangle size={20} />}
              title="Could not load tasks"
              hint={`The list is not empty — it could not be read. ${error}`}
            />
          </div>
        )}

        {!error && tasks.length === 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <EmptyState
              icon={<ListChecks size={20} />}
              title="No matching tasks"
              hint="Try another status, assignee, or project."
            />
          </div>
        )}

        {tasks.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {/* Same grouped list as the project page: one component, one
                shape, and the workflow order is visible in both. */}
            <TaskList
              tasks={tasks as unknown as TaskListRow[]}
              hrefFor={(row) => (row.project ? `/projects/${row.project.id}/tasks/${row.id}` : '#')}
            />
          </div>
        )}

      </PageFrame>
    </AutoRefresh>
  );
}
