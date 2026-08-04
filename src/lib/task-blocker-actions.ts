import { createServerClient } from '@/lib/supabase/server';
import { getUserEmail } from '@/lib/email/helpers';
import { sendEmailWithPrefs, sendStaleBlockerEmail } from '@/lib/email';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '@/app/api/v1/projects/_helpers';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';
import { appendTaskActivityEvent } from '@/lib/task-activity';

export type BlockerActionType = 'follow-up' | 'escalate' | 'stale-escalation';
export type BlockerWorkflowActionType = 'follow-up' | 'escalate';

export interface BlockerWorkflowInput {
  nextAction: string;
  owner: string;
  dueAt: string;
}

export interface BlockerWorkflowActor {
  agentId?: string | null;
  userId?: string | null;
  name: string;
  participantRole?: string | null;
  participantAccessKind?: string | null;
}

export function normalizeBlockerWorkflowInput(input: BlockerWorkflowInput) {
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

async function resolveBlockerActionContext(
  supabase: ReturnType<typeof createServerClient>,
  projectId: string,
  taskId: string,
) {
  const actionAt = new Date().toISOString();

  const [{ data: task }, { data: project }, { data: blockedBy }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, project_id, assignee_agent_id, blocked_at, blocker_escalated_at')
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

export async function runBlockerWorkflowAction(options: {
  supabase?: ReturnType<typeof createServerClient>;
  projectId: string;
  taskId: string;
  type: BlockerWorkflowActionType;
  input: BlockerWorkflowInput;
  actor: BlockerWorkflowActor;
}) {
  const supabase = options.supabase ?? createServerClient();
  const workflow = normalizeBlockerWorkflowInput(options.input);
  const { actionAt, task, project, activeBlockers } = await resolveBlockerActionContext(supabase, options.projectId, options.taskId);

  const updates: Record<string, string> = {
    blocker_follow_up_at: actionAt,
    blocker_followed_through_at: actionAt,
    blocker_resolution_action: workflow.nextAction,
    blocker_resolution_owner: workflow.owner,
    blocker_resolution_due_at: workflow.dueAtIso,
    blocker_resolution_status: options.type,
    updated_at: actionAt,
  };

  if (options.type === 'escalate') {
    updates.blocker_escalated_at = actionAt;
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', options.taskId)
    .eq('project_id', options.projectId);

  if (updateError) throw new Error(`Failed to ${options.type === 'escalate' ? 'escalate blocked task' : 'log blocker follow-up'}: ${updateError.message}`);

  const blockerSummary = activeBlockers.map((blocker) => blocker.title).join(', ') || 'current blockers';
  const content = options.type === 'escalate'
    ? `Escalated blocker on ${blockerSummary}: ${workflow.nextAction} (owner: ${workflow.owner}, due: ${workflow.dueAtIso})`
    : `Logged blocker follow-up on ${blockerSummary}: ${workflow.nextAction} (owner: ${workflow.owner}, due: ${workflow.dueAtIso})`;

  const metadata = {
    action: options.type === 'escalate' ? 'blocker_escalation' : 'blocker_follow_up',
    blocker_titles: activeBlockers.map((blocker) => blocker.title),
    acted_at: actionAt,
    actor_agent_id: options.actor.agentId ?? null,
    blocker_resolution_action: workflow.nextAction,
    blocker_resolution_owner: workflow.owner,
    blocker_resolution_due_at: workflow.dueAtIso,
    blocker_resolution_status: options.type,
    participant_role: options.actor.participantRole ?? null,
    participant_access_kind: options.actor.participantAccessKind ?? null,
  };

  const { error: commentError } = await supabase.from('task_comments').insert({
    task_id: options.taskId,
    project_id: options.projectId,
    author_agent_id: options.actor.agentId ?? null,
    author_name: options.actor.name,
    content,
    comment_type: 'system',
    metadata,
  });

  if (commentError) throw new Error(`Failed to log blocker ${options.type === 'escalate' ? 'escalation' : 'comment'} comment: ${commentError.message}`);

  await appendTaskActivityEvent({
    projectId: options.projectId,
    taskId: options.taskId,
    actorAgentId: options.actor.agentId ?? null,
    actorUserId: options.actor.userId ?? null,
    eventType: options.type === 'escalate' ? 'blocker_escalation' : 'blocker_follow_up',
    summary: options.type === 'escalate' ? `Escalated blocker on ${blockerSummary}` : `Logged blocker follow-up on ${blockerSummary}`,
    metadata,
  }).catch(() => {});

  await notifyBlockerAction(supabase, {
    projectId: options.projectId,
    taskId: options.taskId,
    taskTitle: task.title,
    projectTitle: project?.title || 'Unknown Project',
    assigneeAgentId: task.assignee_agent_id,
    blockerTitles: activeBlockers.map((blocker) => blocker.title),
    actorName: options.actor.name,
    action: options.type,
    blockedAt: task.blocked_at ?? null,
    blockerFollowUpAt: actionAt,
    blockerFollowedThroughAt: actionAt,
    blockerEscalatedAt: options.type === 'escalate' ? actionAt : task.blocker_escalated_at ?? null,
    blockerResolutionAction: workflow.nextAction,
    blockerResolutionOwner: workflow.owner,
    blockerResolutionDueAt: workflow.dueAtIso,
    blockerResolutionStatus: options.type,
  }).catch(() => {});

  return {
    actionAt,
    task,
    project,
    activeBlockers,
    workflow: {
      nextAction: workflow.nextAction,
      owner: workflow.owner,
      dueAtIso: workflow.dueAtIso,
      status: options.type,
    },
  };
}

export async function refreshTaskBlockedState(
  supabase: ReturnType<typeof createServerClient>,
  taskId: string
): Promise<void> {
  const { data: deps } = await supabase
    .from('task_dependencies')
    .select('dependency_type, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(status)')
    .eq('blocked_task_id', taskId)
    .eq('dependency_type', 'blocks');

  const hasActiveBlockers = (deps || []).some((dep) => {
    const blocking = Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task;
    return !!blocking && blocking.status !== 'done' && blocking.status !== 'cancelled';
  });

  if (hasActiveBlockers) {
    await supabase
      .from('tasks')
      .update({ blocked_at: new Date().toISOString() })
      .eq('id', taskId)
      .is('blocked_at', null);
    return;
  }

  await supabase
    .from('tasks')
    .update({
      blocked_at: null,
      blocker_follow_up_at: null,
      blocker_followed_through_at: null,
      blocker_escalated_at: null,
      blocker_resolution_action: null,
      blocker_resolution_owner: null,
      blocker_resolution_due_at: null,
      blocker_resolution_status: null,
    })
    .eq('id', taskId);
}

export async function notifyBlockerAction(
  supabase: ReturnType<typeof createServerClient>,
  options: {
    projectId: string;
    taskId: string;
    taskTitle: string;
    projectTitle: string;
    assigneeAgentId: string | null;
    blockerTitles: string[];
    actorName: string;
    action: BlockerActionType;
    hoursBlocked?: number;
    blockedAt?: string | null;
    blockerFollowUpAt?: string | null;
    blockerFollowedThroughAt?: string | null;
    blockerEscalatedAt?: string | null;
    blockerResolutionAction?: string | null;
    blockerResolutionOwner?: string | null;
    blockerResolutionDueAt?: string | null;
    blockerResolutionStatus?: string | null;
  }
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://a2a.playground.montytorr.com';
  const blockerSummary = options.blockerTitles.filter(Boolean).join(', ') || 'task dependencies';
  const taskUrl = `${appUrl}/projects/${options.projectId}/tasks/${options.taskId}`;
  const blockerPlan = [
    options.blockerResolutionAction?.trim() || null,
    options.blockerResolutionOwner?.trim() ? `owner: ${options.blockerResolutionOwner.trim()}` : null,
    options.blockerResolutionDueAt ? `follow-up: ${options.blockerResolutionDueAt}` : null,
  ].filter(Boolean).join(' · ') || null;

  if (options.action === 'stale-escalation') {
    const memberIds = await getProjectMemberAgentIds(options.projectId);
    if (memberIds.length > 0) {
      await deliverWebhooks(memberIds, {
        event: 'task.blocker_stale',
        project_id: options.projectId,
        task_id: options.taskId,
        data: {
          title: options.taskTitle,
          project_title: options.projectTitle,
          blocker_titles: options.blockerTitles,
          blocker_summary: blockerSummary,
          escalated_by: options.actorName,
          escalation_reason: options.hoursBlocked
            ? `The task has been blocked for ${options.hoursBlocked}h and crossed the stale-blocker escalation threshold.`
            : 'The task crossed the stale-blocker escalation threshold.',
          hours_blocked: options.hoursBlocked ?? null,
          blocked_at: options.blockedAt ?? null,
          blocker_follow_up_at: options.blockerFollowUpAt ?? null,
          blocker_followed_through_at: options.blockerFollowedThroughAt ?? null,
          blocker_escalated_at: options.blockerEscalatedAt ?? null,
          blocker_resolution_action: options.blockerResolutionAction ?? null,
          blocker_resolution_owner: options.blockerResolutionOwner ?? null,
          blocker_resolution_due_at: options.blockerResolutionDueAt ?? null,
          blocker_resolution_status: options.blockerResolutionStatus ?? null,
          blocker_plan: blockerPlan,
          task_url: taskUrl,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (!options.assigneeAgentId) return;

  const { data: assigneeAgent } = await supabase
    .from('agents')
    .select('owner_user_id, display_name, name')
    .eq('id', options.assigneeAgentId)
    .single();

  if (!assigneeAgent?.owner_user_id) return;

  const email = await getUserEmail(assigneeAgent.owner_user_id);
  if (!email) return;

  if (options.action === 'stale-escalation') {
    await sendStaleBlockerEmail(email, {
      taskTitle: options.taskTitle,
      projectName: options.projectTitle,
      blockerSummary,
      escalationReason: options.hoursBlocked
        ? `The task has been blocked for ${options.hoursBlocked}h and crossed the stale-blocker escalation threshold.`
        : 'The task crossed the stale-blocker escalation threshold.',
      actedBy: options.actorName,
      blockerOwner: options.blockerResolutionOwner ?? undefined,
      nextAction: options.blockerResolutionAction ?? undefined,
      followUpAt: options.blockerResolutionDueAt ?? undefined,
      taskUrl,
    }, assigneeAgent.owner_user_id);
    return;
  }

  const actionLabel = options.action === 'escalate' ? 'Blocker escalated' : 'Blocker follow-up logged';
  const actionBody = options.action === 'escalate'
    ? `${options.actorName} escalated a stale blocker on ${options.taskTitle}.${blockerPlan ? ` Unblock plan: ${blockerPlan}.` : ''}`
    : `${options.actorName} logged blocker follow-up on ${options.taskTitle}.${blockerPlan ? ` Unblock plan: ${blockerPlan}.` : ''}`;

  await sendEmailWithPrefs(email, assigneeAgent.owner_user_id, 'task-assigned', {
    taskTitle: `${actionLabel}: ${options.taskTitle}`,
    projectName: options.projectTitle,
    priority: options.action === 'escalate' ? 'urgent' : 'medium',
    taskUrl,
    summary: actionBody,
    blockerSummary,
  });
}

export function staleBlockerNeedsEscalation(task: {
  updatedAt: string;
  blockedAt?: string | null;
  blockerFollowUpAt?: string | null;
  blockerFollowedThroughAt?: string | null;
  blockerEscalatedAt?: string | null;
  blockerTitles: string[];
}): boolean {
  const state = getBlockedTaskNotificationState({
    updatedAt: task.updatedAt,
    blockedAt: task.blockedAt,
    blockerFollowUpAt: task.blockerFollowUpAt,
    blockerFollowedThroughAt: task.blockerFollowedThroughAt,
    blockerEscalatedAt: task.blockerEscalatedAt,
    blockedByCount: task.blockerTitles.length,
    blockingTaskTitles: task.blockerTitles,
  });

  return state.stale && !state.blockerEscalatedAt;
}
