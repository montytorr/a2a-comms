import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import type { ProjectInvitationStatus, ProjectStatus } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import { formatDate } from '@/lib/format-date';
import MarkdownPreview from '@/components/markdown-preview';
import ProjectFilters from './filters';
import InvitationInbox from './invitation-inbox';
import { hydrateProjectInvitations } from '@/app/api/v1/projects/_helpers';
import { categorizeProjectInvitations, type InvitationLike } from './invitation-utils';
import { applyProjectInvitationVisibility } from '@/lib/project-invitation-visibility';
import { buildProjectCardAccessMap } from '@/lib/project-card-access';
import { normalizeProjectPrivacyMetadata } from '@/lib/privacy-policy';
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
  searchParams: Promise<{ status?: string; inbox?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const params = await searchParams;
  const statusFilter = (params.status || 'all') as ProjectStatus | 'all';
  const inboxFilter = params.inbox || 'all';
  const supabase = createServerClient();
  noStore();

  const agentScope = auth.agentScope;

  // Get project IDs where the signed-in user has access, plus the per-project access mode.
  let scopedProjectIds: string[] | null = null;
  let projectAccessById: Record<string, ReturnType<typeof buildProjectCardAccessMap>[string]> = {};
  if (!user.isSuperAdmin) {
    const [{ data: memberRows }, { data: observerRows }, { data: inviteRowsRaw }] = await Promise.all([
      supabase
        .from('project_members')
        .select('project_id, role')
        .in('agent_id', agentScope),
      supabase
        .from('project_observers')
        .select('project_id')
        .in('agent_id', agentScope),
      supabase
        .from('project_member_invitations')
        .select('*, project:projects(id, title), agent:agents!project_member_invitations_agent_id_fkey(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)')
        .in('agent_id', agentScope)
        .order('created_at', { ascending: false }),
    ]);

    const inviteRows = await hydrateProjectInvitations(inviteRowsRaw || []);
    const memberProjectIds = new Set((memberRows || []).map((row) => row.project_id));
    const ownerProjectIds = new Set((memberRows || []).filter((row) => row.role === 'owner').map((row) => row.project_id));
    const observerProjectIds = new Set((observerRows || []).map((row) => row.project_id));
    const inviteProjectIds = new Set(inviteRows.map((inv) => inv.project_id).filter(Boolean));
    const scopedSet = new Set<string>(memberProjectIds);
    observerProjectIds.forEach((projectId) => scopedSet.add(projectId));
    inviteProjectIds.forEach((projectId) => scopedSet.add(projectId));
    scopedProjectIds = Array.from(scopedSet);
    projectAccessById = buildProjectCardAccessMap({
      user,
      projectIds: scopedProjectIds,
      memberProjectIds,
      ownerProjectIds,
      observerProjectIds,
      inviteProjectIds,
    });

    const visibleInviteRows = inviteRows.filter((inv) => {
      const access = projectAccessById[inv.project_id || ''];
      return applyProjectInvitationVisibility([inv], {
        trust_tier: auth.trustTier,
        trust_policy: auth.trustPolicy,
      }, {
        treatAsObserver: access?.treatInvitationsAsObserverSummary ?? false,
        includeObserverSummary: true,
      }).visibleInvitations.length > 0;
    });

    const { pendingMine, historyMine } = categorizeProjectInvitations(visibleInviteRows, auth.agentScope);

    return renderProjectsPage({
      userIsSuperAdmin: user.isSuperAdmin,
      supabase,
      scopedProjectIds,
      projectAccessById,
      statusFilter,
      inboxFilter,
      pendingMine,
      historyMine,
      user,
      auth: { trustTier: auth.trustTier, trustPolicy: auth.trustPolicy },
    });
  }

  return renderProjectsPage({
    userIsSuperAdmin: user.isSuperAdmin,
    supabase,
    scopedProjectIds,
    statusFilter,
    inboxFilter,
    pendingMine: [],
    historyMine: [],
    projectAccessById,
    user,
    auth: { trustTier: auth.trustTier, trustPolicy: auth.trustPolicy },
  });
}

async function renderProjectsPage({
  supabase,
  scopedProjectIds,
  statusFilter,
  inboxFilter,
  pendingMine,
  historyMine,
  projectAccessById,
  user,
}: {
  userIsSuperAdmin: boolean;
  supabase: ReturnType<typeof createServerClient>;
  scopedProjectIds: string[] | null;
  statusFilter: ProjectStatus | 'all';
  inboxFilter: string;
  pendingMine: InvitationLike[];
  historyMine: InvitationLike[];
  projectAccessById: Record<string, ReturnType<typeof buildProjectCardAccessMap>[string]>;
  user: { id: string; displayName: string; isSuperAdmin: boolean; trustTier?: string; trustPolicy?: unknown };
  auth?: { trustTier: 'internal' | 'partner' | 'external'; trustPolicy: unknown };
}) {
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
  let rows = projects || [];

  if (inboxFilter === 'needs-response') {
    const pendingProjectIds = new Set(pendingMine.map((inv) => inv.project_id).filter(Boolean));
    rows = rows.filter((project) => pendingProjectIds.has(project.id));
  } else if (inboxFilter === 'history') {
    const historyProjectIds = new Set(historyMine.map((inv) => inv.project_id).filter(Boolean));
    rows = rows.filter((project) => historyProjectIds.has(project.id));
  }

  // Get member counts and task stats for all projects
  const projectIds = rows.map(p => p.id);

  const activeUser = user!;
  const memberCounts: Record<string, number> = {};
  const observerCounts: Record<string, number> = {};
  const taskStats: Record<string, { total: number; done: number }> = {};
  const sprintNames: Record<string, string | null> = {};
  const hiddenPendingInvitationCounts: Record<string, number> = {};
  const canSeeInvitationSummaries: Record<string, boolean> = {};

  if (projectIds.length > 0) {
    const [membersRes, observersRes, tasksRes, sprintsRes, invitationRes] = await Promise.all([
      supabase.from('project_members').select('project_id').in('project_id', projectIds),
      supabase.from('project_observers').select('project_id').in('project_id', projectIds),
      supabase.from('tasks').select('project_id, status').in('project_id', projectIds),
      supabase.from('sprints').select('project_id, title, status').in('project_id', projectIds).eq('status', 'active'),
      supabase
        .from('project_member_invitations')
        .select('project_id, status, agent_id, invited_by_agent_id, created_at')
        .in('project_id', projectIds),
    ]);

    for (const m of membersRes.data || []) {
      memberCounts[m.project_id] = (memberCounts[m.project_id] || 0) + 1;
    }

    for (const observer of observersRes.data || []) {
      observerCounts[observer.project_id] = (observerCounts[observer.project_id] || 0) + 1;
    }

    for (const t of tasksRes.data || []) {
      if (t.status === 'cancelled') continue;
      if (!taskStats[t.project_id]) taskStats[t.project_id] = { total: 0, done: 0 };
      taskStats[t.project_id].total++;
      if (t.status === 'done') taskStats[t.project_id].done++;
    }

    for (const s of sprintsRes.data || []) {
      sprintNames[s.project_id] = s.title;
    }

    const invitationBuckets = new Map<string, Array<{ project_id: string; status: ProjectInvitationStatus; agent_id: string; invited_by_agent_id: string; created_at: string }>>();
    for (const invitation of invitationRes.data || []) {
      const bucket = invitationBuckets.get(invitation.project_id) || [];
      bucket.push(invitation);
      invitationBuckets.set(invitation.project_id, bucket);
    }

    for (const projectId of projectIds) {
      const access = projectAccessById[projectId];
      const visibility = applyProjectInvitationVisibility(invitationBuckets.get(projectId) || [], {
        trust_tier: activeUser.trustTier || 'external',
        trust_policy: activeUser.trustPolicy || null,
      }, {
        treatAsObserver: access?.treatInvitationsAsObserverSummary ?? false,
        includeObserverSummary: true,
      });
      hiddenPendingInvitationCounts[projectId] = visibility.hiddenPendingCount;
      canSeeInvitationSummaries[projectId] = visibility.canSeeSummary;
    }
  }

  return (
    <AutoRefresh intervalMs={15000}>
      <div className="p-4 sm:p-6 lg:p-10">
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

        {(pendingMine.length > 0 || historyMine.length > 0) && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8 animate-fade-in">
            <InvitationInbox
              title="My project invitations"
              invitations={pendingMine}
              empty="No pending invitations."
            />
            <InvitationInbox
              title="Recently resolved"
              invitations={historyMine.slice(0, 6)}
              empty="No recently resolved invitations."
            />
          </div>
        )}

        <ProjectFilters current={statusFilter} />

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
              const access = projectAccessById[project.id];
              const members = memberCounts[project.id] || 0;
              const observers = observerCounts[project.id] || 0;
              const activeSprint = sprintNames[project.id] || null;
              const hiddenPendingInvitations = hiddenPendingInvitationCounts[project.id] || 0;
              const privacyMetadata = normalizeProjectPrivacyMetadata(project.privacy_metadata);
              const canSeeInvitationSummary = !!canSeeInvitationSummaries[project.id];
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
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="text-[15px] font-bold text-white tracking-tight group-hover:text-cyan-400 transition-colors duration-200 line-clamp-2">
                        {project.title}
                      </h3>
                      <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${sc.bg} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {project.status}
                      </span>
                    </div>

                    {project.description && (
                      <div className="overflow-hidden line-clamp-2 mb-4">
                        <MarkdownPreview content={project.description} className="text-[11px] text-gray-500 leading-relaxed" />
                      </div>
                    )}

                    <div className="mb-4 flex flex-wrap gap-2">
                      {activeSprint && (
                        <span className="text-[10px] font-medium text-cyan-400/70 bg-cyan-500/[0.06] px-2 py-0.5 rounded-full border border-cyan-500/10">
                          🏃 {activeSprint}
                        </span>
                      )}
                      <span className="text-[10px] font-medium text-fuchsia-200 bg-fuchsia-500/[0.08] px-2 py-0.5 rounded-full border border-fuchsia-500/10">
                        {privacyMetadata.visibility}
                      </span>
                      <span className="text-[10px] font-medium text-gray-300 bg-white/[0.03] px-2 py-0.5 rounded-full border border-white/[0.06]">
                        {privacyMetadata.retention_days}d retention
                      </span>
                      {!privacyMetadata.allow_observer_access && (
                        <span className="text-[10px] font-medium text-amber-200 bg-amber-500/[0.08] px-2 py-0.5 rounded-full border border-amber-500/10">
                          observer restricted
                        </span>
                      )}
                    </div>

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

                    {canSeeInvitationSummary && hiddenPendingInvitations > 0 && (
                      <div className="mb-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-gray-500">Restricted invitation summary</p>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {hiddenPendingInvitations} pending invitation{hiddenPendingInvitations !== 1 ? 's are' : ' is'} hidden by trust policy for this observer-visible project.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-4 border-t border-white/[0.04]">
                      {access?.canSeeParticipantCounts !== false && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span className="text-[11px] text-gray-500 font-medium">{members}</span>
                          </div>
                          {observers > 0 && (
                            <div className="flex items-center gap-1.5">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                              <span className="text-[11px] text-gray-500 font-medium">{observers} observer{observers !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                        </>
                      )}
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
