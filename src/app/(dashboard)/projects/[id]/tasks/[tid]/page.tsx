import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect, notFound } from 'next/navigation';
import MarkdownPreview from '@/components/markdown-preview';
import AutoRefresh from '@/components/auto-refresh';
import type { TaskStatus, TaskPriority } from '@/lib/types';
export const dynamic = 'force-dynamic';

const statusConfig: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  backlog: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', dot: 'bg-gray-500' },
  todo: { bg: 'bg-blue-500/[0.08]', text: 'text-blue-400', dot: 'bg-blue-400' },
  'in-progress': { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  'in-review': { bg: 'bg-amber-500/[0.08]', text: 'text-amber-400', dot: 'bg-amber-400' },
  done: { bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  cancelled: { bg: 'bg-red-500/[0.08]', text: 'text-red-400', dot: 'bg-red-400' },
};

const priorityConfig: Record<TaskPriority, { bg: string; text: string; icon: string }> = {
  urgent: { bg: 'bg-red-500/[0.1]', text: 'text-red-400', icon: '🔴' },
  high: { bg: 'bg-orange-500/[0.1]', text: 'text-orange-400', icon: '🟠' },
  medium: { bg: 'bg-blue-500/[0.08]', text: 'text-blue-400', icon: '🔵' },
  low: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', icon: '⚪' },
};

const avatarGradients = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarGradients.length;
}

function AgentBadge({ agent }: { agent: { name: string; display_name: string } | null }) {
  if (!agent) return <span className="text-[12px] text-gray-600 italic">Unassigned</span>;
  const name = agent.display_name || agent.name;
  const idx = getAvatarIndex(name);
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGradients[idx]} flex items-center justify-center text-[9px] font-bold text-white`}>
        {name[0]?.toUpperCase()}
      </div>
      <span className="text-[13px] text-gray-300 font-medium">{name}</span>
    </div>
  );
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; tid: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { id: projectId, tid } = await params;
  const supabase = createServerClient();
  noStore();

  // Fetch task
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', tid)
    .eq('project_id', projectId)
    .single();

  if (error || !task) notFound();

  // Verify access
  if (!user.isSuperAdmin) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);

    if (!membership || membership.length === 0) redirect('/projects');
  }

  // Fetch related data in parallel
  const [
    projectRes, assigneeRes, reporterRes, sprintRes,
    blockedByRes, blocksRes, contractsRes, auditRes,
  ] = await Promise.all([
    supabase.from('projects').select('id, title').eq('id', projectId).single(),
    task.assignee_agent_id
      ? supabase.from('agents').select('id, name, display_name').eq('id', task.assignee_agent_id).single()
      : Promise.resolve({ data: null }),
    task.reporter_agent_id
      ? supabase.from('agents').select('id, name, display_name').eq('id', task.reporter_agent_id).single()
      : Promise.resolve({ data: null }),
    task.sprint_id
      ? supabase.from('sprints').select('id, title, status').eq('id', task.sprint_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('task_dependencies')
      .select('id, blocking_task_id, tasks!task_dependencies_blocking_task_id_fkey(id, title, status)')
      .eq('blocked_task_id', tid),
    supabase
      .from('task_dependencies')
      .select('id, blocked_task_id, tasks!task_dependencies_blocked_task_id_fkey(id, title, status)')
      .eq('blocking_task_id', tid),
    supabase
      .from('task_contracts')
      .select('id, contract:contracts(id, title, status)')
      .eq('task_id', tid),
    supabase
      .from('audit_log')
      .select('*')
      .eq('resource_type', 'task')
      .eq('resource_id', tid)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const project = projectRes.data;
  const assignee = assigneeRes.data;
  const reporter = reporterRes.data;
  const sprint = sprintRes.data;
  const blockedBy = (blockedByRes.data || []) as any[];
  const blocks = (blocksRes.data || []) as any[];
  const linkedContracts = (contractsRes.data || []) as any[];
  const auditEntries = auditRes.data || [];

  const sc = statusConfig[task.status as TaskStatus] || statusConfig.backlog;
  const pc = priorityConfig[task.priority as TaskPriority] || priorityConfig.medium;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <AutoRefresh intervalMs={15000}>
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 animate-fade-in">
        <Link href="/projects" className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">Projects</Link>
        <span className="text-gray-700 text-[10px]">›</span>
        <Link href={`/projects/${projectId}`} className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">
          {project?.title || 'Project'}
        </Link>
        <span className="text-gray-700 text-[10px]">›</span>
        <span className="text-[11px] text-gray-400">Task</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title + Status */}
          <div className="animate-fade-in">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1">
                <h1 className="text-[24px] font-bold text-white tracking-tight mb-3">{task.title}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase ${sc.bg} ${sc.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {task.status}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase ${pc.bg} ${pc.text}`}>
                    {pc.icon} {task.priority}
                  </span>
                  {isOverdue && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold text-red-400 bg-red-500/[0.1] border border-red-500/20">
                      ⚠ Overdue
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.05s' }}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-3">Description</p>
              <MarkdownPreview content={task.description} />
            </div>
          )}

          {/* Dependencies */}
          {(blockedBy.length > 0 || blocks.length > 0) && (
            <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Dependencies</p>

              {blockedBy.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-medium text-red-400/80 mb-2">Blocked by</p>
                  <div className="space-y-1.5">
                    {blockedBy.map((dep: any) => {
                      const t = dep.tasks;
                      if (!t) return null;
                      const dsc = statusConfig[t.status as TaskStatus] || statusConfig.backlog;
                      return (
                        <Link
                          key={dep.id}
                          href={`/projects/${projectId}/tasks/${t.id}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dsc.dot}`} />
                          <span className="text-[12px] text-gray-300 hover:text-cyan-400 transition-colors">{t.title}</span>
                          <span className={`text-[9px] font-semibold uppercase ${dsc.text} ml-auto`}>{t.status}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {blocks.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-amber-400/80 mb-2">Blocks</p>
                  <div className="space-y-1.5">
                    {blocks.map((dep: any) => {
                      const t = dep.tasks;
                      if (!t) return null;
                      const dsc = statusConfig[t.status as TaskStatus] || statusConfig.backlog;
                      return (
                        <Link
                          key={dep.id}
                          href={`/projects/${projectId}/tasks/${t.id}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dsc.dot}`} />
                          <span className="text-[12px] text-gray-300 hover:text-cyan-400 transition-colors">{t.title}</span>
                          <span className={`text-[9px] font-semibold uppercase ${dsc.text} ml-auto`}>{t.status}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linked Contracts */}
          {linkedContracts.length > 0 && (
            <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Linked Contracts</p>
              <div className="space-y-1.5">
                {linkedContracts.map((lc: any) => {
                  const c = lc.contract;
                  if (!c) return null;
                  return (
                    <Link
                      key={lc.id}
                      href={`/contracts/${c.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400/60">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <span className="text-[12px] text-gray-300 hover:text-cyan-400 transition-colors">{c.title}</span>
                      <span className="text-[9px] font-semibold uppercase text-gray-500 ml-auto">{c.status}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity */}
          {auditEntries.length > 0 && (
            <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Activity</p>
              <div className="space-y-3">
                {auditEntries.map((entry: any) => (
                  <div key={entry.id} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400">
                        <span className="font-medium text-gray-300">{entry.actor}</span>
                        {' '}
                        <span className="text-gray-600">{entry.action.replace('task.', '')}</span>
                        {entry.details && typeof entry.details === 'object' && entry.details.status && (
                          <span className="text-gray-500"> → {entry.details.status}</span>
                        )}
                      </p>
                      <p className="text-[9px] text-gray-700 font-mono tabular-nums mt-0.5">
                        {new Date(entry.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details Card */}
          <div className="rounded-2xl glass-card p-5 animate-fade-in" style={{ animationDelay: '0.05s' }}>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-4">Details</p>

            <div className="space-y-4">
              {/* Assignee */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Assignee</p>
                <AgentBadge agent={assignee} />
              </div>

              {/* Reporter */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Reporter</p>
                <AgentBadge agent={reporter} />
              </div>

              {/* Sprint */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Sprint</p>
                {sprint ? (
                  <span className="text-[12px] text-gray-300 font-medium">{sprint.title}</span>
                ) : (
                  <span className="text-[12px] text-gray-600 italic">Backlog</span>
                )}
              </div>

              {/* Due Date */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Due Date</p>
                {task.due_date ? (
                  <span className={`text-[12px] font-mono tabular-nums ${isOverdue ? 'text-red-400' : 'text-gray-300'}`}>
                    {new Date(task.due_date).toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                ) : (
                  <span className="text-[12px] text-gray-600 italic">No due date</span>
                )}
              </div>

              {/* Labels */}
              {task.labels && task.labels.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-2">Labels</p>
                  <div className="flex flex-wrap gap-1.5">
                    {task.labels.map((label: string) => (
                      <span
                        key={label}
                        className="text-[10px] font-medium text-violet-400 bg-violet-500/[0.08] px-2 py-0.5 rounded-full border border-violet-500/10"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Created */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Created</p>
                <span className="text-[11px] text-gray-500 font-mono tabular-nums">
                  {new Date(task.created_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </div>

              {/* Updated */}
              <div>
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.1em] mb-1.5">Last Updated</p>
                <span className="text-[11px] text-gray-500 font-mono tabular-nums">
                  {new Date(task.updated_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AutoRefresh>
  );
}
