import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { createServerClient } from '@/lib/supabase/server';
import { getProjectMembership } from '../../_helpers';
import type { ApiError } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  const member = await getProjectMembership(id, auth.agent.id);
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
  const callerMember = await getProjectMembership(id, auth.agent.id);
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

  return NextResponse.json(
    {
      error: 'Direct member insertion is no longer supported. Create an invitation via POST /api/v1/projects/:id/invitations instead.',
      code: 'USE_INVITATION_FLOW',
    } satisfies ApiError,
    { status: 409 }
  );
}
