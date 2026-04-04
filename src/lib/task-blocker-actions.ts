import { createServerClient } from '@/lib/supabase/server';
import { getUserEmail } from '@/lib/email/helpers';
import { sendEmailWithPrefs, sendStaleBlockerEmail } from '@/lib/email';
import { deliverWebhooks } from '@/lib/webhooks';
import { getProjectMemberAgentIds } from '@/app/api/v1/projects/_helpers';
import { getBlockedTaskNotificationState } from '@/lib/task-blocker-notifications';

export type BlockerActionType = 'follow-up' | 'escalate' | 'stale-escalation';

export async function refreshTaskBlockedState(
  supabase: ReturnType<typeof createServerClient>,
  taskId: string
): Promise<void> {
  const { data: deps } = await supabase
    .from('task_dependencies')
    .select('blocking_task:tasks!task_dependencies_blocking_task_id_fkey(status)')
    .eq('blocked_task_id', taskId);

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
  }
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://a2a.playground.montytorr.tech';
  const blockerSummary = options.blockerTitles.filter(Boolean).join(', ') || 'task dependencies';
  const taskUrl = `${appUrl}/projects/${options.projectId}/tasks/${options.taskId}`;

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
      taskUrl,
    }, assigneeAgent.owner_user_id);
    return;
  }

  const actionLabel = options.action === 'escalate' ? 'Blocker escalated' : 'Blocker follow-up logged';
  const actionBody = options.action === 'escalate'
    ? `${options.actorName} escalated a stale blocker on ${options.taskTitle}.`
    : `${options.actorName} logged blocker follow-up on ${options.taskTitle}.`;

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
