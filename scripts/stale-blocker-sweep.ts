import { createServerClient } from '@/lib/supabase/server';
import { notifyBlockerAction, staleBlockerNeedsEscalation } from '@/lib/task-blocker-actions';

function log(message: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  console.log(`[stale-blocker-sweep] ${message}${suffix}`);
}

async function run() {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const dryRun = process.env.STALE_BLOCKER_SWEEP_DRY_RUN === '1';

  const { data: rows, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      project_id,
      assignee_agent_id,
      updated_at,
      blocked_at,
      blocker_follow_up_at,
      blocker_followed_through_at,
      blocker_escalated_at,
      project:projects(title),
      blocked_by:task_dependencies!task_dependencies_blocked_task_id_fkey(
        blocking_task:tasks!task_dependencies_blocking_task_id_fkey(id, title, status)
      )
    `)
    .in('status', ['todo', 'in-progress', 'in-review'])
    .not('blocked_at', 'is', null)
    .is('blocker_escalated_at', null)
    .order('blocked_at', { ascending: true })
    .limit(200);

  if (error) throw error;

  let escalated = 0;
  for (const row of rows || []) {
    const project = Array.isArray(row.project) ? row.project[0] ?? null : row.project;
    const blockers = (row.blocked_by || [])
      .map((dep) => Array.isArray(dep.blocking_task) ? dep.blocking_task[0] ?? null : dep.blocking_task)
      .filter((task): task is { id: string; title: string; status: string } => !!task && task.status !== 'done' && task.status !== 'cancelled');

    const blockerTitles = blockers.map((blocker) => blocker.title);
    if (blockerTitles.length === 0) continue;

    if (!staleBlockerNeedsEscalation({
      updatedAt: row.updated_at,
      blockedAt: row.blocked_at,
      blockerFollowUpAt: row.blocker_follow_up_at,
      blockerFollowedThroughAt: row.blocker_followed_through_at,
      blockerEscalatedAt: row.blocker_escalated_at,
      blockerTitles,
    })) continue;

    escalated += 1;

    if (dryRun) {
      log('would escalate stale blocker', { taskId: row.id, title: row.title, blockers: blockerTitles });
      continue;
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        blocker_escalated_at: now,
        updated_at: now,
      })
      .eq('id', row.id)
      .is('blocker_escalated_at', null);

    if (updateError) {
      log('failed to persist escalation timestamp', { taskId: row.id, error: updateError.message });
      continue;
    }

    try {
      await supabase.from('task_comments').insert({
        task_id: row.id,
        project_id: row.project_id,
        author_agent_id: null,
        author_name: 'Stale blocker sweep',
        content: `Auto-escalated stale blocker on ${blockerTitles.join(', ')}`,
        comment_type: 'system',
        metadata: { action: 'blocker_stale_escalation', blocker_titles: blockerTitles, acted_at: now, automated: true },
      });
    } catch (commentError) {
      log('failed to log stale blocker comment', { taskId: row.id, error: commentError instanceof Error ? commentError.message : String(commentError) });
    }

    await notifyBlockerAction(supabase, {
      projectId: row.project_id,
      taskId: row.id,
      taskTitle: row.title,
      projectTitle: project?.title || 'Unknown Project',
      assigneeAgentId: row.assignee_agent_id,
      blockerTitles,
      actorName: 'Stale blocker sweep',
      action: 'stale-escalation',
      blockedAt: row.blocked_at,
      blockerFollowUpAt: row.blocker_follow_up_at,
      blockerFollowedThroughAt: row.blocker_followed_through_at,
      blockerEscalatedAt: now,
      hoursBlocked: row.blocked_at ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(row.blocked_at).getTime()) / (1000 * 60 * 60))) : undefined,
    }).catch((notifyError) => {
      log('failed to send stale blocker notifications', { taskId: row.id, error: notifyError instanceof Error ? notifyError.message : String(notifyError) });
    });

    log('escalated stale blocker', { taskId: row.id, title: row.title, blockers: blockerTitles });
  }

  log(dryRun ? 'dry run complete' : 'sweep complete', { escalated });
}

run().catch((error) => {
  console.error('[stale-blocker-sweep] fatal', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
