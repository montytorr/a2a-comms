'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProjectStatus(projectId: string, status: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(`Failed to update project status: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateTaskStatus(projectId: string, taskId: string, status: string) {
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
