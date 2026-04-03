'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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

  // Resolve author name from the project-member agent (not user.agentIds[0])
  let authorName = 'Dashboard User';
  const authorAgentId = user.memberAgentId ?? null;
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
