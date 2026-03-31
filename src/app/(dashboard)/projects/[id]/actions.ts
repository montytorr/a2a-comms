'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';

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

export async function createTask(
  projectId: string,
  title: string,
  status: string,
  priority: string,
  sprintId?: string,
) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();
  const { error } = await supabase.from('tasks').insert({
    project_id: projectId,
    title,
    status,
    priority,
    sprint_id: sprintId || null,
    labels: [],
  });
  if (error) throw new Error(`Failed to create task: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}
