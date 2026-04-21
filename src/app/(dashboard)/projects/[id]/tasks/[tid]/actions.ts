'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { notifyBlockerAction } from '@/lib/task-blocker-actions';
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

type BlockerWorkflowInput = {
  nextAction: string;
  owner: string;
  dueAt: string;
};

function normalizeBlockerWorkflowInput(input: BlockerWorkflowInput) {
  const nextAction = input.nextAction.trim();
  const owner = input.owner.trim();
  const dueAt = input.dueAt.trim();

  if (!nextAction) throw new Error('Next action is required');
  if (!owner) throw new Error('Unblock owner is required');
  if (!dueAt) throw new Error('Expected follow-up time is required');

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) throw new Error('Expected follow-up time is invalid');

  return {
    nextAction,
    owner,
    dueAtIso: dueDate.toISOString(),
  };
}

async function resolveBlockerActionContext(projectId: string, taskId: string) {
  const supabase = createServerClient();
  const actionAt = new Date().toISOString();

  const [{ data: task }, { data: project }, { data: blockedBy }] = await Promise.all([
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
    supabase
      .from('task_dependencies')
      .select('dependency_type, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status)')
      .eq('blocked_task_id', taskId)
      .eq('dependency_type', 'blocks'),
  ]);

  if (!task) throw new Error('Task not found');

  const activeBlockers = (blockedBy || [])
    .map((dep) => Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task)
    .filter((blocker): blocker is { id: string; title: string; status: string } => !!blocker && blocker.status !== 'done' && blocker.status !== 'cancelled');

  return { supabase, actionAt, task, project, activeBlockers };
}

async function runBlockerWorkflowAction(
  projectId: string,
  taskId: string,
  type: 'follow-up' | 'escalate',
  input: BlockerWorkflowInput,
) {
  const user = await requireProjectMembership(projectId);
  const workflow = normalizeBlockerWorkflowInput(input);
  const { supabase, actionAt, task, project, activeBlockers } = await resolveBlockerActionContext(projectId, taskId);

  const updates: Record<string, string> = {
    blocker_follow_up_at: actionAt,
    blocker_followed_through_at: actionAt,
    blocker_resolution_action: workflow.nextAction,
    blocker_resolution_owner: workflow.owner,
    blocker_resolution_due_at: workflow.dueAtIso,
    blocker_resolution_status: type,
    updated_at: actionAt,
  };

  if (type === 'escalate') {
    updates.blocker_escalated_at = actionAt;
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('project_id', projectId);

  if (updateError) throw new Error(`Failed to ${type === 'escalate' ? 'escalate blocked task' : 'log blocker follow-up'}: ${updateError.message}`);

  const { data: actorAgent } = user.memberAgentId
    ? await supabase.from('agents').select('name, display_name').eq('id', user.memberAgentId).single()
    : { data: null };
  const actorName = actorAgent?.display_name || actorAgent?.name || user.displayName || 'Dashboard User';
  const blockerSummary = activeBlockers.map((blocker) => blocker.title).join(', ') || 'current blockers';
  const content = type === 'escalate'
    ? `Escalated blocker on ${blockerSummary}: ${workflow.nextAction} (owner: ${workflow.owner}, due: ${workflow.dueAtIso})`
    : `Logged blocker follow-up on ${blockerSummary}: ${workflow.nextAction} (owner: ${workflow.owner}, due: ${workflow.dueAtIso})`;

  const metadata = {
    action: type === 'escalate' ? 'blocker_escalation' : 'blocker_follow_up',
    blocker_titles: activeBlockers.map((blocker) => blocker.title),
    acted_at: actionAt,
    actor_agent_id: user.memberAgentId ?? null,
    blocker_resolution_action: workflow.nextAction,
    blocker_resolution_owner: workflow.owner,
    blocker_resolution_due_at: workflow.dueAtIso,
    blocker_resolution_status: type,
    participant_role: user.projectRole,
    participant_access_kind: user.accessKind,
  };

  const { error: commentError } = await supabase.from('task_comments').insert({
    task_id: taskId,
    project_id: projectId,
    author_agent_id: user.memberAgentId ?? null,
    author_name: actorName,
    content,
    comment_type: 'system',
    metadata,
  });

  if (commentError) throw new Error(`Failed to log blocker ${type === 'escalate' ? 'escalation' : 'comment'} comment: ${commentError.message}`);

  await appendTaskActivityEvent({
    projectId,
    taskId,
    actorAgentId: user.memberAgentId ?? null,
    actorUserId: user.id,
    eventType: type === 'escalate' ? 'blocker_escalation' : 'blocker_follow_up',
    summary: type === 'escalate' ? `Escalated blocker on ${blockerSummary}` : `Logged blocker follow-up on ${blockerSummary}`,
    metadata,
  }).catch(() => {});

  await notifyBlockerAction(supabase, {
    projectId,
    taskId,
    taskTitle: task.title,
    projectTitle: project?.title || 'Unknown Project',
    assigneeAgentId: task.assignee_agent_id,
    blockerTitles: activeBlockers.map((blocker) => blocker.title),
    actorName,
    action: type === 'escalate' ? 'escalate' : 'follow-up',
  }).catch(() => {});

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/notifications');
}

export async function logBlockerFollowUp(projectId: string, taskId: string, input: BlockerWorkflowInput) {
  return runBlockerWorkflowAction(projectId, taskId, 'follow-up', input);
}

export async function escalateBlockedTask(projectId: string, taskId: string, input: BlockerWorkflowInput) {
  return runBlockerWorkflowAction(projectId, taskId, 'escalate', input);
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
