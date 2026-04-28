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
import { ProgressBar } from '@/components/atoms';
import { Users, Layers, Eye, Plus, MoreHorizontal, FolderKanban } from 'lucide-react';

export const dynamic = 'force-dynamic';

const statusTone: Record<ProjectStatus, string> = {
  planning: 'amber',
  active: 'amber',
  completed: 'mint',
  archived: 'ghost',
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
      <div style={{ padding: '28px 32px 60px' }}>
        {/* Header */}
        <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div className="col gap-1">
            <div className="upper">Management</div>
            <div className="h1">Projects</div>
            <div className="muted" style={{ fontSize: 13 }}>
              <span className="num">{rows.length}</span> project{rows.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="row gap-2">
            <Link href="/projects/new" className="btn btn--primary" style={{ textDecoration: 'none' }}>
              <Plus size={13} />New Project
            </Link>
          </div>
        </div>

        {/* Invitations */}
        {(pendingMine.length > 0 || historyMine.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
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

        {/* Project cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 16 }}>
          {rows.length === 0 ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center' }}>
              <FolderKanban size={32} style={{ color: 'var(--fg-3)', margin: '0 auto' }} />
              <div className="h3" style={{ marginTop: 14 }}>No projects found</div>
              <div className="dim" style={{ fontSize: 13, marginTop: 4 }}>Create a project to start organizing tasks</div>
            </div>
          ) : (
            rows.map((project) => {
              const stats = taskStats[project.id] || { total: 0, done: 0 };
              const access = projectAccessById[project.id];
              const members = memberCounts[project.id] || 0;
              const observers = observerCounts[project.id] || 0;
              const activeSprint = sprintNames[project.id] || null;
              const hiddenPendingInvitations = hiddenPendingInvitationCounts[project.id] || 0;
              const privacyMetadata = normalizeProjectPrivacyMetadata(project.privacy_metadata);
              const canSeeInvitationSummary = !!canSeeInvitationSummaries[project.id];
              const tone = statusTone[project.status as ProjectStatus] || 'ghost';
              const isActive = project.status === 'active' || project.status === 'planning';
              const isComplete = project.status === 'completed';

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="card"
                  style={{
                    padding: 18,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'block',
                  }}
                >
                  {/* Status pill */}
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className={`pill pill--${tone}`}>
                      <span className={`dot dot--${tone} ${isActive ? 'pulse' : ''}`} />
                      {project.status}
                    </span>
                    <span className="btn btn--ghost btn--sm btn--icon" style={{ width: 24, height: 24 }}>
                      <MoreHorizontal size={13} />
                    </span>
                  </div>

                  {/* Title */}
                  <div className="h2" style={{ marginBottom: 4 }}>{project.title}</div>
                  {project.description && (
                    <div className="dim" style={{
                      fontSize: 12,
                      marginBottom: 14,
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      <MarkdownPreview content={project.description} className="" />
                    </div>
                  )}

                  {/* Tags */}
                  <div className="row gap-1" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
                    {activeSprint && (
                      <span className="pill pill--ghost" style={{ fontSize: 10 }}>{activeSprint}</span>
                    )}
                    <span className="pill pill--ghost" style={{ fontSize: 10 }}>{privacyMetadata.visibility}</span>
                    <span className="pill pill--ghost" style={{ fontSize: 10 }}>{privacyMetadata.retention_days}d retention</span>
                  </div>

                  {/* Progress */}
                  {stats.total > 0 && (
                    <div className="col gap-2" style={{ marginBottom: 14 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="upper" style={{ fontSize: 10 }}>Progress</span>
                        <span className="mono num" style={{ fontSize: 11, color: 'var(--fg-1)' }}>
                          {stats.done}/{stats.total}
                        </span>
                      </div>
                      <ProgressBar
                        value={stats.done}
                        max={stats.total}
                        color={isComplete ? 'var(--mint)' : 'var(--amber)'}
                        height={3}
                      />
                    </div>
                  )}

                  {/* Hidden invitations summary */}
                  {canSeeInvitationSummary && hiddenPendingInvitations > 0 && (
                    <div className="card card--inset" style={{ padding: '8px 12px', marginBottom: 14 }}>
                      <div className="upper" style={{ fontSize: 9 }}>Restricted invitation summary</div>
                      <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                        {hiddenPendingInvitations} pending invitation{hiddenPendingInvitations !== 1 ? 's' : ''} hidden by trust policy
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-1)' }}>
                    <div className="row gap-3">
                      {access?.canSeeParticipantCounts !== false && (
                        <>
                          <span className="mono dim" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Users size={11} /> {members}
                          </span>
                          {observers > 0 && (
                            <span className="mono dim" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Eye size={11} /> {observers}
                            </span>
                          )}
                        </>
                      )}
                      <span className="mono dim" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Layers size={11} /> {stats.total} tasks
                      </span>
                    </div>
                    <span className="mono dim" style={{ fontSize: 11 }}>{formatDate(project.created_at)}</span>
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
