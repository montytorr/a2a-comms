'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runBlockerWorkflowAction as applyBlockerWorkflowAction, type BlockerWorkflowInput } from '@/lib/task-blocker-actions';
import { ensureAttachmentBucket, uploadAttachmentBinary, validateAttachmentInput, buildAttachmentStoragePath, sha256Buffer } from '@/lib/attachments';
import { buildObserverCommentMetadata, normalizeObserverCommentType } from '@/lib/observer-mode';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { resolveProjectActorAccess } from '@/lib/dashboard-actor-helpers';
import { appendTaskActivityEvent } from '@/lib/task-activity';

async function requireProjectMembership(
  projectId: string,
  options?: { requireRole?: string; allowObserverCommentary?: boolean }
) {
  const auth = await getAuthActorContext();
  if (!auth) throw new Error('Unauthorized');

  return resolveProjectActorAccess(auth, projectId, options);
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
  const user = await requireProjectMembership(projectId);

  const supabase = createServerClient();
  const { data: previousTask } = await supabase
    .from('tasks')
    .select('title, description, priority, assignee_agent_id, labels, due_date, sprint_id')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .single();

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

  const activityWrites: Promise<unknown>[] = [];
  if (data.title !== undefined && data.title !== previousTask?.title) {
    activityWrites.push(appendTaskActivityEvent({ projectId, taskId, actorAgentId: user.memberAgentId ?? null, actorUserId: user.id, eventType: 'title_updated', summary: 'Task title updated', metadata: { old_title: previousTask?.title ?? null, new_title: data.title } }));
  }
  if (data.description !== undefined && data.description !== previousTask?.description) {
    activityWrites.push(appendTaskActivityEvent({ projectId, taskId, actorAgentId: user.memberAgentId ?? null, actorUserId: user.id, eventType: 'description_updated', summary: 'Task description updated', metadata: { had_description: !!previousTask?.description, has_description: !!data.description } }));
  }
  if (data.priority !== undefined && data.priority !== previousTask?.priority) {
    activityWrites.push(appendTaskActivityEvent({ projectId, taskId, actorAgentId: user.memberAgentId ?? null, actorUserId: user.id, eventType: 'priority_change', summary: `Priority changed to ${data.priority}`, metadata: { old_priority: previousTask?.priority ?? null, new_priority: data.priority } }));
  }
  if (data.assignee_agent_id !== undefined && data.assignee_agent_id !== previousTask?.assignee_agent_id) {
    activityWrites.push(appendTaskActivityEvent({ projectId, taskId, actorAgentId: user.memberAgentId ?? null, actorUserId: user.id, eventType: 'assignment', summary: data.assignee_agent_id ? 'Task reassigned' : 'Assignee removed', metadata: { old_assignee: previousTask?.assignee_agent_id ?? null, new_assignee: data.assignee_agent_id ?? null } }));
  }
  if (data.labels !== undefined && JSON.stringify(data.labels ?? []) !== JSON.stringify(previousTask?.labels ?? [])) {
    activityWrites.push(appendTaskActivityEvent({ projectId, taskId, actorAgentId: user.memberAgentId ?? null, actorUserId: user.id, eventType: 'labels_updated', summary: 'Task labels updated', metadata: { old_labels: previousTask?.labels ?? [], new_labels: data.labels ?? [] } }));
  }
  if (data.due_date !== undefined && data.due_date !== previousTask?.due_date) {
    activityWrites.push(appendTaskActivityEvent({ projectId, taskId, actorAgentId: user.memberAgentId ?? null, actorUserId: user.id, eventType: 'due_date_updated', summary: data.due_date ? 'Due date updated' : 'Due date cleared', metadata: { old_due_date: previousTask?.due_date ?? null, new_due_date: data.due_date ?? null } }));
  }
  if (data.sprint_id !== undefined && data.sprint_id !== previousTask?.sprint_id) {
    activityWrites.push(appendTaskActivityEvent({ projectId, taskId, actorAgentId: user.memberAgentId ?? null, actorUserId: user.id, eventType: 'sprint_updated', summary: data.sprint_id ? 'Task moved to sprint' : 'Task removed from sprint', metadata: { old_sprint_id: previousTask?.sprint_id ?? null, new_sprint_id: data.sprint_id ?? null } }));
  }
  await Promise.all(activityWrites.map((p) => p.catch(() => null)));
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function addComment(
  projectId: string,
  taskId: string,
  content: string,
) {
  const user = await requireProjectMembership(projectId, { allowObserverCommentary: true });

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
      comment_type: user.accessKind === 'observer' ? normalizeObserverCommentType('analysis') : 'comment',
      metadata: user.accessKind === 'observer'
        ? {
            ...buildObserverCommentMetadata(),
            participant_role: user.projectRole,
            participant_access_kind: user.accessKind,
          }
        : {
            participant_role: user.projectRole,
            participant_access_kind: user.accessKind,
          },
    });

  if (error) throw new Error(`Failed to add comment: ${error.message}`);

  await appendTaskActivityEvent({
    projectId,
    taskId,
    actorAgentId: authorAgentId,
    actorUserId: user.id,
    eventType: user.accessKind === 'observer' ? 'analysis' : 'comment',
    summary: user.accessKind === 'observer' ? 'Analysis note added' : 'Comment added',
    metadata: {
      participant_role: user.projectRole,
      participant_access_kind: user.accessKind,
    },
  }).catch(() => {});

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
}

async function runDashboardBlockerWorkflowAction(
  projectId: string,
  taskId: string,
  type: 'follow-up' | 'escalate',
  input: BlockerWorkflowInput,
) {
  const user = await requireProjectMembership(projectId);
  const supabase = createServerClient();
  const { data: actorAgent } = user.memberAgentId
    ? await supabase.from('agents').select('name, display_name').eq('id', user.memberAgentId).single()
    : { data: null };
  const actorName = actorAgent?.display_name || actorAgent?.name || user.displayName || 'Dashboard User';

  await applyBlockerWorkflowAction({
    supabase,
    projectId,
    taskId,
    type,
    input,
    actor: {
      agentId: user.memberAgentId ?? null,
      userId: user.id,
      name: actorName,
      participantRole: user.projectRole,
      participantAccessKind: user.accessKind,
    },
  });

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/notifications');
}

export async function logBlockerFollowUp(projectId: string, taskId: string, input: BlockerWorkflowInput) {
  return runDashboardBlockerWorkflowAction(projectId, taskId, 'follow-up', input);
}

export async function escalateBlockedTask(projectId: string, taskId: string, input: BlockerWorkflowInput) {
  return runDashboardBlockerWorkflowAction(projectId, taskId, 'escalate', input);
}

export async function uploadTaskAttachment(projectId: string, taskId: string, formData: FormData) {
  const user = await requireProjectMembership(projectId);
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('File is required');
  const note = typeof formData.get('note') === 'string' ? formData.get('note') as string : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const validated = validateAttachmentInput({ filename: file.name, mimeType: file.type, sizeBytes: buffer.length });
  const storagePath = buildAttachmentStoragePath({ projectId, taskId, filename: validated.filename });

  await ensureAttachmentBucket();
  await uploadAttachmentBinary(storagePath, buffer, validated.mimeType);

  const supabase = createServerClient();
  const { error } = await supabase.from('task_attachments').insert({
    project_id: projectId,
    task_id: taskId,
    uploader_agent_id: user.memberAgentId,
    uploader_user_id: user.id,
    filename: validated.filename,
    original_name: file.name,
    mime_type: validated.mimeType,
    size_bytes: buffer.length,
    storage_bucket: 'artifacts',
    storage_path: storagePath,
    sha256: sha256Buffer(buffer),
    metadata: note ? { note } : {},
  });
  if (error) throw new Error(`Failed to save attachment: ${error.message}`);

  await supabase.from('audit_log').insert({
    actor: user.displayName || user.email,
    action: 'attachment.upload',
    resource_type: 'task',
    resource_id: taskId,
    details: {
      project_id: projectId,
      filename: file.name,
      mime_type: validated.mimeType,
      size_bytes: buffer.length,
      actor_agent_id: user.memberAgentId ?? null,
      participant_role: user.projectRole,
      participant_access_kind: user.accessKind,
    },
  });

  await appendTaskActivityEvent({
    projectId,
    taskId,
    actorAgentId: user.memberAgentId ?? null,
    actorUserId: user.id,
    eventType: 'attachment_uploaded',
    summary: `Attachment uploaded: ${file.name}`,
    metadata: {
      filename: file.name,
      mime_type: validated.mimeType,
      size_bytes: buffer.length,
      participant_role: user.projectRole,
      participant_access_kind: user.accessKind,
    },
  }).catch(() => {});

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
}

export async function deleteTask(projectId: string, taskId: string) {
  await requireProjectMembership(projectId);

  const supabase = createServerClient();

  // Get all task IDs in this project to scope dependency deletion
  const { data: projectTasks } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId);
  const projectTaskIds = (projectTasks || []).map((t: { id: string }) => t.id);

  // Delete dependencies only where both tasks belong to this project
  if (projectTaskIds.length > 0) {
    await supabase
      .from('task_dependencies')
      .delete()
      .eq('blocked_task_id', taskId)
      .in('blocking_task_id', projectTaskIds);
    await supabase
      .from('task_dependencies')
      .delete()
      .eq('blocking_task_id', taskId)
      .in('blocked_task_id', projectTaskIds);
  }

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
