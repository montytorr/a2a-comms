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

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));

  const supabase = createServerClient();

  // Get project IDs where this agent is a member
  const { data: memberRows, error: memErr } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('agent_id', auth.agent.id);

  if (memErr) {
    return NextResponse.json(
      { error: 'Failed to fetch projects', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  const projectIds = (memberRows || []).map((r) => r.project_id);

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

  // Add additional members if provided
  if (parsed.members && parsed.members.length > 0) {
    for (const agentId of parsed.members) {
      if (agentId !== auth.agent.id) {
        members.push({ project_id: project.id, agent_id: agentId, role: 'member' });
      }
    }
  }

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

  await auditLog({
    actor: auth.agent.name,
    action: 'project.create',
    resourceType: 'project',
    resourceId: project.id,
    details: { title: parsed.title, members: members.map(m => m.agent_id) },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(project, { status: 201 });
}
