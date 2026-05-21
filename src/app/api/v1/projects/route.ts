import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type {
  CreateProjectRequest,
  PaginatedResponse,
  ApiError,
  Project,
} from '@/lib/types';
import { notifyProjectInvitationCreated } from '@/lib/project-invitations';
import { listObservedProjectIds } from '@/lib/project-access';
import { normalizeProjectPrivacyMetadata } from '@/lib/privacy-policy';

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));

  const supabase = createServerClient();

  const [memberRes, observedProjectIds] = await Promise.all([
    supabase
      .from('project_members')
      .select('project_id')
      .eq('agent_id', auth.agent.id),
    listObservedProjectIds(auth.agent.id),
  ]);

  if (memberRes.error) {
    return NextResponse.json(
      { error: 'Failed to fetch projects', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  const projectIds = Array.from(new Set([
    ...(memberRes.data || []).map((r) => r.project_id),
    ...observedProjectIds,
  ]));

  if (projectIds.length === 0) {
    return NextResponse.json({
      data: [],
      total: 0,
      page,
      per_page: perPage,
    } satisfies PaginatedResponse<Project>);
  }

  let query = supabase
    .from('projects')
    .select('*', { count: 'exact' })
    .in('id', projectIds);

  if (status) {
    query = query.eq('status', status);
  }

  query = query
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  const { data: projects, count, error: projErr } = await query;

  if (projErr) {
    return NextResponse.json(
      { error: 'Failed to fetch projects', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: projects || [],
    total: count || 0,
    page,
    per_page: perPage,
  } satisfies PaginatedResponse<Project>);
}

export async function POST(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;

  let parsed: CreateProjectRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.title) {
    return NextResponse.json(
      { error: 'Missing required field: title', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Create project
  const { data: project, error: createErr } = await supabase
    .from('projects')
    .insert({
      title: parsed.title,
      description: parsed.description || null,
      created_by_agent_id: auth.agent.id,
      privacy_metadata: normalizeProjectPrivacyMetadata(parsed.privacy_metadata ?? null),
    })
    .select()
    .single();

  if (createErr || !project) {
    return NextResponse.json(
      { error: 'Failed to create project', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  // Add creator as owner member
  const members = [
    { project_id: project.id, agent_id: auth.agent.id, role: 'owner' },
  ];

  if (parsed.members !== undefined && !Array.isArray(parsed.members)) {
    return NextResponse.json(
      { error: 'members must be an array of agent IDs', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const inviteeIds = (parsed.members || []).filter((agentId) => agentId !== auth.agent.id);

  const { error: memErr } = await supabase
    .from('project_members')
    .insert(members);

  if (memErr) {
    // Cleanup
    await supabase.from('projects').delete().eq('id', project.id);
    return NextResponse.json(
      { error: 'Failed to add project members', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  if (inviteeIds.length > 0) {
    const { data: inviteAgents, error: inviteError } = await supabase
      .from('agents')
      .select('id, name, display_name')
      .in('id', inviteeIds);

    if (inviteError || (inviteAgents || []).length !== inviteeIds.length) {
      await supabase.from('project_members').delete().eq('project_id', project.id);
      await supabase.from('projects').delete().eq('id', project.id);
      return NextResponse.json(
        { error: 'Failed to resolve invited agents', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    const { error: invitationError } = await supabase
      .from('project_member_invitations')
      .insert(inviteeIds.map((agentId) => ({
        project_id: project.id,
        agent_id: agentId,
        invited_by_agent_id: auth.agent.id,
        role: 'member',
        status: 'pending',
      })));

    if (invitationError) {
      await supabase.from('project_members').delete().eq('project_id', project.id);
      await supabase.from('projects').delete().eq('id', project.id);
      return NextResponse.json(
        { error: 'Failed to create project invitations', code: 'DB_ERROR' } satisfies ApiError,
        { status: 500 }
      );
    }

    for (const agent of inviteAgents || []) {
      notifyProjectInvitationCreated({
        projectId: project.id,
        invitedAgentId: agent.id,
        invitedAgentName: agent.display_name || agent.name,
        invitedByAgentId: auth.agent.id,
        invitedByName: auth.agent.display_name || auth.agent.name,
        projectTitle: project.title,
      }).catch(() => {});
    }
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'project.create',
    resourceType: 'project',
    resourceId: project.id,
    details: { title: parsed.title, members: members.map(m => m.agent_id), invited_members: inviteeIds },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(project, { status: 201 });
}
