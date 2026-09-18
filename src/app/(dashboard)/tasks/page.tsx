import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { ListChecks } from 'lucide-react';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { listMyTasks, OPEN_STATUSES } from '@/lib/my-tasks';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format-date';
import { PageFrame, SectionHeader, Avatar } from '@/components/atoms';
import AutoRefresh from '@/components/auto-refresh';
import TaskFilters from './filters';

export const dynamic = 'force-dynamic';

const priorityTone: Record<string, string> = {
  urgent: 'pill--rose',
  high: 'pill--amber',
  medium: 'pill--peri',
  low: '',
};

const statusTone: Record<string, string> = {
  'in-progress': 'pill--peri',
  blocked: 'pill--rose',
  done: 'pill--mint',
  todo: '',
};

/** Overdue and due-today deserve to look different from a date in three weeks. */
const dueTone = (due: string | null) => {
  if (!due) return 'var(--fg-3)';
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'var(--rose)';
  if (days <= 1) return 'var(--amber)';
  return 'var(--fg-3)';
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
      assignee: params.assignee === 'all' ? 'all' : 'me',
    }),
    createServerClient()
      .from('projects')
      .select('id, title')
      .order('title', { ascending: true })
      .limit(200),
  ]);

  const projects = (projectList.data ?? []) as unknown as Array<{ id: string; title: string }>;
  const scopeLabel = params.assignee === 'all' ? 'All tasks' : 'Assigned to you';
  const statusLabel = !params.status || params.status === 'open'
    ? `open (${OPEN_STATUSES.join(', ')})`
    : params.status;

  return (
    <AutoRefresh intervalMs={30000} watch={['tasks', 'projects']}>
      <PageFrame>
        <SectionHeader
          eyebrow="Delivery"
          title="Tasks"
          sub={`${scopeLabel} across every project · ${tasks.length} shown · ${statusLabel}`}
        />

        <TaskFilters projects={projects} />

        {error && (
          <div className="card" style={{ padding: 16, marginTop: 16, borderColor: 'var(--rose-line)' }}>
            <div className="text-sm" style={{ color: 'var(--rose)' }}>Could not load tasks: {error}</div>
          </div>
        )}

        {!error && tasks.length === 0 && (
          <div className="card" style={{ padding: 40, marginTop: 16, textAlign: 'center' }}>
            <ListChecks size={22} style={{ color: 'var(--fg-4)', margin: '0 auto 10px' }} />
            <div className="text-sm muted" style={{ fontWeight: 500 }}>Nothing open</div>
            <div className="text-2xs dim" style={{ marginTop: 4 }}>
              No tasks match this filter.
            </div>
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
                      <span key={label} className="pill pill--ghost text-2xs" style={{ height: 16 }}>{label}</span>
                    ))}
                  </div>
                </div>

                <div className="row gap-2" style={{ alignItems: 'center', flexShrink: 0 }}>
                  {task.priority && (
                    <span className={`pill ${priorityTone[task.priority] ?? ''} text-2xs`} style={{ height: 18 }}>
                      {task.priority}
                    </span>
                  )}
                  <span className={`pill ${statusTone[task.status] ?? ''} text-2xs`} style={{ height: 18 }}>
                    {task.status}
                  </span>
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
