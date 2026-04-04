'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import { getProjectInvitationExpiry, notifyProjectInvitationCreated, notifyProjectInvitationResponded } from '@/lib/project-invitations';
import { refreshTaskBlockedState } from '@/lib/task-blocker-actions';

async function requireProjectMembership(
  projectId: string,
  options?: { requireRole?: string }
) {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');
  if (user.isSuperAdmin) return user;

  const supabase = createServerClient();
  const { data: membership } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
    .limit(1);

  if (!membership || membership.length === 0) throw new Error('Forbidden');

  if (options?.requireRole && membership[0].role !== options.requireRole) {
    throw new Error('Forbidden');
  }

  return user;
}

export async function updateProjectStatus(projectId: string, status: string) {
  await requireProjectMembership(projectId, { requireRole: 'owner' });

  const supabase = createServerClient();
  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(`Failed to update project status: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateTaskStatus(projectId: string, taskId: string, status: string) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();
  const { error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('project_id', projectId);
  if (error) throw new Error(`Failed to update task status: ${error.message}`);
  await refreshTaskBlockedState(supabase, taskId);
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateSprintStatus(projectId: string, sprintId: string, status: string) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();
  const { error } = await supabase
    .from('sprints')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sprintId)
    .eq('project_id', projectId);
  if (error) throw new Error(`Failed to update sprint status: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function inviteProjectMember(projectId: string, agentId: string) {
  const user = await requireProjectMembership(projectId, { requireRole: 'owner' });
  const supabase = createServerClient();

  const [{ data: project }, { data: existing }, { data: existingInvite }, { data: agent }] = await Promise.all([
    supabase.from('projects').select('id, title').eq('id', projectId).single(),
    supabase.from('project_members').select('id').eq('project_id', projectId).eq('agent_id', agentId).single(),
    supabase.from('project_member_invitations').select('id, status').eq('project_id', projectId).eq('agent_id', agentId).single(),
    supabase.from('agents').select('id, name, display_name').eq('id', agentId).single(),
  ]);

  if (!project) throw new Error('Project not found');
  if (!agent) throw new Error('Agent not found');
  if (existing) throw new Error('Agent is already a member of this project');
  if (existingInvite?.status === 'pending') throw new Error('Agent already has a pending invitation');

  const inviterAgentId = user.agentIds[0];
  if (!inviterAgentId) throw new Error('No owned agent available to send invitation');

  const { error } = await supabase.from('project_member_invitations').upsert({
    project_id: projectId,
    agent_id: agentId,
    invited_by_agent_id: inviterAgentId,
    role: 'member',
    status: 'pending',
    responded_at: null,
    reminder_sent_at: null,
    expires_at: getProjectInvitationExpiry(new Date()),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,agent_id' });

  if (error) throw new Error(`Failed to invite member: ${error.message}`);

  notifyProjectInvitationCreated({
    projectId,
    invitedAgentId: agentId,
    invitedAgentName: agent.display_name || agent.name,
    invitedByAgentId: inviterAgentId,
    invitedByName: user.displayName,
    projectTitle: project.title,
  }).catch(() => {});

  revalidatePath(`/projects/${projectId}`);
}

export async function respondToProjectInvitation(
  projectId: string,
  invitationId: string,
  action: 'accept' | 'decline' | 'cancel'
) {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');

  const supabase = createServerClient();
  const { data: invitation } = await supabase
    .from('project_member_invitations')
    .select('*, agent:agents(id, name, display_name), invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name), project:projects(id, title)')
    .eq('id', invitationId)
    .eq('project_id', projectId)
    .single();

  if (!invitation) throw new Error('Invitation not found');
  if (invitation.status !== 'pending') {
    throw new Error(invitation.status === 'expired' ? 'Invitation has expired' : 'Invitation has already been resolved');
  }

  const isInvitee = user.agentIds.includes(invitation.agent_id);
  const isOwner = user.isSuperAdmin || !!(await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('role', 'owner')
    .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
    .limit(1)).data?.length;

  if (action === 'cancel') {
    if (!isOwner) throw new Error('Only project owners can cancel invitations');
  } else if (!isInvitee && !user.isSuperAdmin) {
    throw new Error('Only the invited agent can respond to this invitation');
  }

  const nextStatus = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled';
  const respondedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('project_member_invitations')
    .update({ status: nextStatus, responded_at: respondedAt, updated_at: respondedAt })
    .eq('id', invitationId)
    .eq('project_id', projectId)
    .eq('status', 'pending');

  if (updateError) throw new Error(`Failed to update invitation: ${updateError.message}`);

  if (nextStatus === 'accepted') {
    const { error: addMemberError } = await supabase.from('project_members').insert({
      project_id: projectId,
      agent_id: invitation.agent_id,
      role: invitation.role,
    });
    if (addMemberError && addMemberError.code !== '23505') {
      throw new Error(`Failed to add member: ${addMemberError.message}`);
    }
  }

  notifyProjectInvitationResponded({
    projectId,
    projectTitle: invitation.project?.title || 'Unknown Project',
    invitedAgentId: invitation.agent_id,
    invitedAgentName: invitation.agent?.display_name || invitation.agent?.name || 'Unknown Agent',
    invitedByAgentId: invitation.invited_by_agent_id,
    invitedByName: invitation.invited_by?.display_name || invitation.invited_by?.name || 'Unknown Agent',
    status: nextStatus,
  }).catch(() => {});

  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectMember(projectId: string, memberId: string) {
  await requireProjectMembership(projectId, { requireRole: 'owner' });

  const supabase = createServerClient();

  // Prevent removing an owner
  const { data: member } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('id', memberId)
    .eq('project_id', projectId)
    .single();

  if (!member) throw new Error('Member not found');
  if (member.role === 'owner') throw new Error('Cannot remove the project owner');

  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('id', memberId)
    .eq('project_id', projectId);
  if (error) throw new Error(`Failed to remove member: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function getAvailableAgents(projectId: string) {
  const supabase = createServerClient();

  // Get all agents
  const { data: allAgents } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .order('name');

  // Get current members
  const { data: currentMembers } = await supabase
    .from('project_members')
    .select('agent_id')
    .eq('project_id', projectId);

  const memberIds = new Set((currentMembers || []).map(m => m.agent_id));
  return (allAgents || []).filter(a => !memberIds.has(a.id));
}

export async function createSprint(
  projectId: string,
  title: string,
  startDate?: string,
  endDate?: string,
  goal?: string,
) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();

  // Get max position
  const { data: sprints } = await supabase
    .from('sprints')
    .select('position')
    .eq('project_id', projectId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = sprints && sprints.length > 0 ? sprints[0].position + 1 : 0;

  const { error } = await supabase.from('sprints').insert({
    project_id: projectId,
    title,
    start_date: startDate || null,
    end_date: endDate || null,
    goal: goal || null,
    status: 'planned',
    position: nextPosition,
  });
  if (error) throw new Error(`Failed to create sprint: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateSprint(
  projectId: string,
  sprintId: string,
  data: { title?: string; startDate?: string; endDate?: string; goal?: string },
) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.startDate !== undefined) updates.start_date = data.startDate || null;
  if (data.endDate !== undefined) updates.end_date = data.endDate || null;
  if (data.goal !== undefined) updates.goal = data.goal || null;

  const { error } = await supabase
    .from('sprints')
    .update(updates)
    .eq('id', sprintId)
    .eq('project_id', projectId);
  if (error) throw new Error(`Failed to update sprint: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  data: { title?: string; description?: string | null }
) {
  await requireProjectMembership(projectId, { requireRole: 'owner' });

  const supabase = createServerClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;

  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId);
  if (error) throw new Error(`Failed to update project: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function createTask(
  projectId: string,
  title: string,
  status: string,
  priority: string,
  sprintId?: string,
  assigneeAgentId?: string,
  labels?: string[],
  dueDate?: string,
  description?: string,
) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();

  // Validate sprint belongs to same project
  if (sprintId) {
    const { data: sprint } = await supabase
      .from('sprints')
      .select('id')
      .eq('id', sprintId)
      .eq('project_id', projectId)
      .single();
    if (!sprint) throw new Error('Sprint not found in this project');
  }
  const { error } = await supabase.from('tasks').insert({
    project_id: projectId,
    title,
    description: description || null,
    status,
    priority,
    sprint_id: sprintId || null,
    assignee_agent_id: assigneeAgentId || null,
    labels: labels || [],
    due_date: dueDate || null,
  });
  if (error) throw new Error(`Failed to create task: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}
