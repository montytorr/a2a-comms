'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { notifyBlockerAction } from '@/lib/task-blocker-actions';

async function requireProjectMembership(
  projectId: string,
  options?: { requireRole?: string }
) {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');
  if (user.isSuperAdmin) return { ...user, memberAgentId: user.agentIds[0] ?? null };

  const supabase = createServerClient();
  const { data: membership } = await supabase
    .from('project_members')
    .select('id, role, agent_id')
    .eq('project_id', projectId)
    .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
    .limit(1);

  if (!membership || membership.length === 0) throw new Error('Forbidden');

  if (options?.requireRole && membership[0].role !== options.requireRole) {
    throw new Error('Forbidden');
  }

  return { ...user, memberAgentId: membership[0].agent_id as string };
}

export async function updateTask(
  projectId: string,
  taskId: string,
  data: {
    title?: string;
    description?: string | null;
    priority?: string;
    assignee_agent_id?: string | null;
    labels?: string[];
    due_date?: string | null;
    sprint_id?: string | null;
  },
) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.assignee_agent_id !== undefined) updates.assignee_agent_id = data.assignee_agent_id;
  if (data.labels !== undefined) updates.labels = data.labels;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.sprint_id !== undefined) updates.sprint_id = data.sprint_id;

  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('project_id', projectId);

  if (error) throw new Error(`Failed to update task: ${error.message}`);
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function addComment(
  projectId: string,
  taskId: string,
  content: string,
) {
  const user = await requireProjectMembership(projectId);

  const supabase = createServerClient();

  // Resolve author from the project-member agent (not user.agentIds[0])
  let authorName = 'Dashboard User';
  const authorAgentId: string | null = user.memberAgentId ?? null;
  if (authorAgentId) {
    const { data: agent } = await supabase
      .from('agents')
      .select('name, display_name')
      .eq('id', authorAgentId)
      .single();
    if (agent) authorName = agent.display_name || agent.name;
  }

  const { error } = await supabase
    .from('task_comments')
    .insert({
      task_id: taskId,
      project_id: projectId,
      author_agent_id: authorAgentId,
      author_name: authorName,
      content: content.trim(),
      comment_type: 'comment',
      metadata: {},
    });

  if (error) throw new Error(`Failed to add comment: ${error.message}`);
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
}

export async function logBlockerFollowUp(projectId: string, taskId: string) {
  const user = await requireProjectMembership(projectId);
  const supabase = createServerClient();
  const actionAt = new Date().toISOString();

  const [{ data: task }, { data: project }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, project_id, assignee_agent_id')
      .eq('id', taskId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single(),
  ]);

  if (!task) throw new Error('Task not found');

  const { data: blockedBy } = await supabase
    .from('task_dependencies')
    .select('blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status)')
    .eq('blocked_task_id', taskId);

  const activeBlockers = (blockedBy || [])
    .map((dep) => Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task)
    .filter((blocker): blocker is { id: string; title: string; status: string } => !!blocker && blocker.status !== 'done' && blocker.status !== 'cancelled');

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      blocker_follow_up_at: actionAt,
      blocker_followed_through_at: actionAt,
      updated_at: actionAt,
    })
    .eq('id', taskId)
    .eq('project_id', projectId);

  if (updateError) throw new Error(`Failed to log blocker follow-up: ${updateError.message}`);

  const actorName = user.displayName || 'Dashboard User';
  const blockerSummary = activeBlockers.map((blocker) => blocker.title).join(', ') || 'current blockers';

  const { error: commentError } = await supabase.from('task_comments').insert({
    task_id: taskId,
    project_id: projectId,
    author_agent_id: user.memberAgentId ?? null,
    author_name: actorName,
    content: `Logged blocker follow-up on ${blockerSummary}`,
    comment_type: 'system',
    metadata: { action: 'blocker_follow_up', blocker_titles: activeBlockers.map((blocker) => blocker.title), acted_at: actionAt },
  });

  if (commentError) throw new Error(`Failed to log blocker comment: ${commentError.message}`);

  await notifyBlockerAction(supabase, {
    projectId,
    taskId,
    taskTitle: task.title,
    projectTitle: project?.title || 'Unknown Project',
    assigneeAgentId: task.assignee_agent_id,
    blockerTitles: activeBlockers.map((blocker) => blocker.title),
    actorName,
    action: 'follow-up',
  }).catch(() => {});

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/notifications');
}

export async function escalateBlockedTask(projectId: string, taskId: string) {
  const user = await requireProjectMembership(projectId);
  const supabase = createServerClient();
  const actionAt = new Date().toISOString();

  const [{ data: task }, { data: project }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, project_id, assignee_agent_id')
      .eq('id', taskId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single(),
  ]);

  if (!task) throw new Error('Task not found');

  const { data: blockedBy } = await supabase
    .from('task_dependencies')
    .select('blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status)')
    .eq('blocked_task_id', taskId);

  const activeBlockers = (blockedBy || [])
    .map((dep) => Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task)
    .filter((blocker): blocker is { id: string; title: string; status: string } => !!blocker && blocker.status !== 'done' && blocker.status !== 'cancelled');

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      blocker_follow_up_at: actionAt,
      blocker_followed_through_at: actionAt,
      blocker_escalated_at: actionAt,
      updated_at: actionAt,
    })
    .eq('id', taskId)
    .eq('project_id', projectId);

  if (updateError) throw new Error(`Failed to escalate blocked task: ${updateError.message}`);

  const actorName = user.displayName || 'Dashboard User';
  const blockerSummary = activeBlockers.map((blocker) => blocker.title).join(', ') || 'current blockers';

  const { error: commentError } = await supabase.from('task_comments').insert({
    task_id: taskId,
    project_id: projectId,
    author_agent_id: user.memberAgentId ?? null,
    author_name: actorName,
    content: `Escalated blocker on ${blockerSummary}`,
    comment_type: 'system',
    metadata: { action: 'blocker_escalation', blocker_titles: activeBlockers.map((blocker) => blocker.title), acted_at: actionAt },
  });

  if (commentError) throw new Error(`Failed to log blocker escalation comment: ${commentError.message}`);

  await notifyBlockerAction(supabase, {
    projectId,
    taskId,
    taskTitle: task.title,
    projectTitle: project?.title || 'Unknown Project',
    assigneeAgentId: task.assignee_agent_id,
    blockerTitles: activeBlockers.map((blocker) => blocker.title),
    actorName,
    action: 'escalate',
  }).catch(() => {});

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/notifications');
}

export async function deleteTask(projectId: string, taskId: string) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();

  // Delete dependencies first
  await supabase
    .from('task_dependencies')
    .delete()
    .or(`blocked_task_id.eq.${taskId},blocking_task_id.eq.${taskId}`);

  // Delete task-contract links
  await supabase
    .from('task_contracts')
    .delete()
    .eq('task_id', taskId);

  // Delete the task
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('project_id', projectId);

  if (error) throw new Error(`Failed to delete task: ${error.message}`);

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
