import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError } from '@/lib/types';

async function verifyMembership(projectId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();
  return data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();
  const { data: members, error } = await supabase
    .from('project_members')
    .select('*, agent:agents(id, name, display_name)')
    .eq('project_id', id)
    .order('joined_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch members', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({ data: members || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  // Verify caller is a member
  const callerMember = await verifyMembership(id, auth.agent.id);
  if (!callerMember) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  if (callerMember.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only project owners can add members', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { agent_id: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.agent_id) {
    return NextResponse.json(
      { error: 'Missing required field: agent_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const role = 'member'; // Always add as member — owner promotion requires separate flow

  // Verify agent exists
  const supabase = createServerClient();
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name')
    .eq('id', parsed.agent_id)
    .single();

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const { data: member, error } = await supabase
    .from('project_members')
    .insert({
      project_id: id,
      agent_id: parsed.agent_id,
      role,
    })
    .select('*, agent:agents(id, name, display_name)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Agent is already a member of this project', code: 'DUPLICATE' } satisfies ApiError,
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to add member', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'project.member_add',
    resourceType: 'project',
    resourceId: id,
    details: { agent_id: parsed.agent_id, role },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(member, { status: 201 });
}
