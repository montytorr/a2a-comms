import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import type { ProjectStatus } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import { formatDate } from '@/lib/format-date';
import MarkdownPreview from '@/components/markdown-preview';
import ProjectFilters from './filters';
export const dynamic = 'force-dynamic';

const statusConfig: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  planning: { bg: 'bg-amber-500/[0.08]', text: 'text-amber-400', dot: 'bg-amber-400' },
  active: { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  completed: { bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  archived: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', dot: 'bg-gray-500' },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const statusFilter = (params.status || 'all') as ProjectStatus | 'all';
  const supabase = createServerClient();
  noStore();

  // Get project IDs where user's agents are members (admin sees all)
  let scopedProjectIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const { data: memberRows } = await supabase
      .from('project_members')
      .select('project_id')
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000']);
    scopedProjectIds = (memberRows || []).map(m => m.project_id);
  }

  let query = supabase.from('projects').select('*');

  if (scopedProjectIds !== null) {
    if (scopedProjectIds.length > 0) {
      query = query.in('id', scopedProjectIds);
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  query = query.order('created_at', { ascending: false });

  const { data: projects } = await query;
  const rows = projects || [];

  // Get member counts and task stats for all projects
  const projectIds = rows.map(p => p.id);
  
  const memberCounts: Record<string, number> = {};
  const taskStats: Record<string, { total: number; done: number }> = {};
  const sprintNames: Record<string, string | null> = {};

  if (projectIds.length > 0) {
    const [membersRes, tasksRes, sprintsRes] = await Promise.all([
      supabase.from('project_members').select('project_id').in('project_id', projectIds),
      supabase.from('tasks').select('project_id, status').in('project_id', projectIds),
      supabase.from('sprints').select('project_id, title, status').in('project_id', projectIds).eq('status', 'active'),
    ]);

    // Count members per project
    for (const m of membersRes.data || []) {
      memberCounts[m.project_id] = (memberCounts[m.project_id] || 0) + 1;
    }

    // Count tasks per project (excluding cancelled from progress)
    for (const t of tasksRes.data || []) {
      if (t.status === 'cancelled') continue; // Exclude cancelled from progress
      if (!taskStats[t.project_id]) taskStats[t.project_id] = { total: 0, done: 0 };
      taskStats[t.project_id].total++;
      if (t.status === 'done') taskStats[t.project_id].done++;
    }

    // Active sprint per project
    for (const s of sprintsRes.data || []) {
      sprintNames[s.project_id] = s.title;
    }
  }

  return (
    <AutoRefresh intervalMs={15000}>
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8 animate-fade-in">
        <div>
          <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Management</p>
          <h1 className="text-[32px] font-bold text-white tracking-tight">Projects</h1>
          <p className="text-sm text-gray-600 mt-1">
            <span className="text-gray-400 tabular-nums font-medium">{rows.length}</span> project{rows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="px-4 py-2.5 text-[12px] font-semibold rounded-xl bg-gradient-to-r from-cyan-500/[0.1] to-blue-500/[0.1] border border-cyan-500/20 text-cyan-400 hover:from-cyan-500/[0.18] hover:to-blue-500/[0.18] hover:border-cyan-500/30 transition-all duration-300 hover:shadow-[0_0_25px_rgba(6,182,212,0.08)] hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Project
        </Link>
      </div>

      {/* Filters */}
      <ProjectFilters current={statusFilter} />

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.length === 0 ? (
          <div className="col-span-full rounded-2xl glass-card px-6 py-20 text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 font-medium">No projects found</p>
            <p className="text-[11px] text-gray-700 mt-1">Create a project to start organizing tasks</p>
          </div>
        ) : (
          rows.map((project, idx) => {
            const stats = taskStats[project.id] || { total: 0, done: 0 };
            const members = memberCounts[project.id] || 0;
            const activeSprint = sprintNames[project.id] || null;
            const sc = statusConfig[project.status as ProjectStatus] || statusConfig.planning;
            const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="rounded-2xl glass-card-hover overflow-hidden animate-fade-in block group"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
                <div className="p-6">
                  {/* Title + Status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-[15px] font-bold text-white tracking-tight group-hover:text-cyan-400 transition-colors duration-200 line-clamp-2">
                      {project.title}
                    </h3>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${sc.bg} ${sc.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      {project.status}
                    </span>
                  </div>

                  {/* Description */}
                  {project.description && (
                    <div className="overflow-hidden line-clamp-2 mb-4">
                      <MarkdownPreview content={project.description} className="text-[11px] text-gray-500 leading-relaxed" />
                    </div>
                  )}

                  {/* Active Sprint */}
                  {activeSprint && (
                    <div className="mb-4">
                      <span className="text-[10px] font-medium text-cyan-400/70 bg-cyan-500/[0.06] px-2 py-0.5 rounded-full border border-cyan-500/10">
                        🏃 {activeSprint}
                      </span>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {stats.total > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Progress</span>
                        <span className="text-[11px] font-mono text-gray-400 tabular-nums">
                          {stats.done}/{stats.total}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Footer Stats */}
                  <div className="flex items-center gap-4 pt-4 border-t border-white/[0.04]">
                    <div className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="text-[11px] text-gray-500 font-medium">{members}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <span className="text-[11px] text-gray-500 font-medium">{stats.total} tasks</span>
                    </div>
                    <span className="text-[10px] text-gray-700 ml-auto font-mono tabular-nums">
                      {formatDate(project.created_at)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
    </AutoRefresh>
  );
}
