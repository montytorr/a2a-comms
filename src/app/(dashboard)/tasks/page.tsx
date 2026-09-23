import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { ListChecks, AlertTriangle } from 'lucide-react';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { listMyTasks } from '@/lib/my-tasks';
import { createServerClient } from '@/lib/db/server';
import { formatDate } from '@/lib/format-date';
import { PageFrame, SectionHeader, Avatar, EmptyState } from '@/components/atoms';
import AutoRefresh from '@/components/auto-refresh';
import StatusBadge from '@/components/status-badge';
import { colorVarForTone, taskPriorityTone } from '@/lib/status-tone';
import TaskFilters from './filters';

export const dynamic = 'force-dynamic';

/** Overdue and due-today deserve to look different from a date in three weeks. */
const dueTone = (due: string | null) => {
  if (!due) return colorVarForTone('neutral');
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return colorVarForTone('rose');
  if (days <= 1) return colorVarForTone('amber');
  return colorVarForTone('neutral');
};

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
          <div className="card" style={{ marginTop: 16 }}>
            {tasks.map((task, i) => (
              <Link
                key={task.id}
                href={task.project ? `/projects/${task.project.id}/tasks/${task.id}` : '#'}
                className="row gap-3"
                style={{
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line-1)',
                  textDecoration: 'none',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                }}
              >
                <div className="col gap-1" style={{ flex: 1, minWidth: '14rem' }}>
                  <div className="text-sm" style={{ color: 'var(--fg-0)', fontWeight: 500 }}>{task.title}</div>
                  <div className="row gap-2 text-2xs dim" style={{ flexWrap: 'wrap' }}>
                    {task.project && <span>{task.project.title}</span>}
                    {task.due_date && (
                      <span style={{ color: dueTone(task.due_date) }}>due {formatDate(task.due_date)}</span>
                    )}
                    {task.labels?.slice(0, 3).map((label) => (
                      // A task label is free text, not a status — `label` keeps it verbatim.
                      <StatusBadge key={label} status={null} label={label} tone="neutral" dot="none" size="sm" />
                    ))}
                  </div>
                </div>

                <div className="row gap-2" style={{ alignItems: 'center', flexShrink: 0 }}>
                  {task.priority && (
                    <StatusBadge
                      status={task.priority}
                      tone={taskPriorityTone(task.priority)}
                      dot="none"
                    />
                  )}
                  <StatusBadge domain="task" status={task.status} dot="static" />
                  {task.assignee && (
                    <span title={task.assignee.display_name || task.assignee.name}>
                      <Avatar name={task.assignee.display_name || task.assignee.name} size={20} />
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageFrame>
    </AutoRefresh>
  );
}
