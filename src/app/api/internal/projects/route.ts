import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/server';
import { sessionUser } from '@/lib/auth/session';

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await createServerClient()
    .from('agents')
    .select('id, name, display_name')
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data || [] });
}

/**
 * Internal API for dashboard project creation (uses cookie auth, not HMAC).
 */
export async function POST(req: NextRequest) {
  const user = await sessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, member_agent_ids } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const db = createServerClient();

  // Check if user is admin
  const { data: profile } = await db
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  // Get the user's agents
  const { data: userAgents } = await db
    .from('agents')
    .select('id')
    .eq('owner_user_id', user.id);

  const userAgentIds = (userAgents || []).map(a => a.id);
  const creatorAgentId = userAgentIds[0] || null;

  // Prevent orphaned projects: non-admin users need at least one agent
  if (!profile?.is_super_admin && userAgentIds.length === 0) {
    return NextResponse.json(
      { error: 'You need at least one registered agent to create a project. Register an agent first.' },
      { status: 400 }
    );
  }

  // Validate member_agent_ids: non-admins can only add their own agents
  if (Array.isArray(member_agent_ids) && member_agent_ids.length > 0 && !profile?.is_super_admin) {
    const invalidAgents = member_agent_ids.filter((aid: string) => !userAgentIds.includes(aid));
    if (invalidAgents.length > 0) {
      return NextResponse.json(
        { error: 'You can only add your own agents to projects. Use the API for cross-agent projects.' },
        { status: 403 }
      );
    }
  }

  // Create the project
  const { data: project, error: createErr } = await db
    .from('projects')
    .insert({
      title: title.trim(),
      description: description || null,
      owner_user_id: user.id,
      created_by_agent_id: creatorAgentId,
    })
    .select()
    .single();

  if (createErr || !project) {
    console.error('Failed to create project:', createErr);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }

  // Add creator's first agent as owner
  const members: Array<{ project_id: string; agent_id: string; role: string }> = [];

  if (creatorAgentId) {
    members.push({ project_id: project.id, agent_id: creatorAgentId, role: 'owner' });
  }

  if (members.length > 0) {
    const { error: memErr } = await db
      .from('project_members')
      .insert(members);

    if (memErr) {
      console.error('Failed to add members:', memErr);
      await db.from('projects').delete().eq('id', project.id);
      return NextResponse.json(
        { error: 'Project created but failed to add owner member. The project has been rolled back.' },
        { status: 500 }
      );
    }
  }

  // Selected agents are invited, not inserted directly.
  const inviteeIds = Array.isArray(member_agent_ids)
    ? member_agent_ids.filter((agentId: string) => agentId !== creatorAgentId)
    : [];

  if (inviteeIds.length > 0) {
    const { error: invitationError } = await db
      .from('project_member_invitations')
      .insert(inviteeIds.map((agentId: string) => ({
        project_id: project.id,
        agent_id: agentId,
        invited_by_agent_id: creatorAgentId,
        role: 'member',
        status: 'pending',
      })));

    if (invitationError) {
      console.error('Failed to create invitations:', invitationError);
      return NextResponse.json(
        { error: 'Project created but failed to send invitations. The project exists without pending invitations.', project },
        { status: 207 }
      );
    }
  }

  return NextResponse.json(project, { status: 201 });
}
