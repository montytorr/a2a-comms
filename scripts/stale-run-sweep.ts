/**
 * Cancels execution runs that stopped heartbeating, and releases the tasks
 * they were holding.
 *
 * Heartbeats were written on every run update and nothing read them. The only
 * consumer of `heartbeat_at` was a render-time predicate used to draw a badge,
 * so a run whose agent died was noticed only if a human opened that task's
 * page — and because nothing ever cleared `tasks.active_run_id`, that task
 * could never start another run. This closes both halves.
 *
 * A silent run is cancelled, not failed. Silence proves a run stopped
 * reporting; it does not prove the work failed.
 */
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';

type ReapedRun = {
  run_id: string;
  task_id: string;
  project_id: string;
  agent_id: string | null;
  previous_status: string;
  heartbeat_at: string | null;
  silent_minutes: number;
};

const STALE_AFTER_MINUTES = Number(process.env.STALE_RUN_AFTER_MINUTES ?? 15);
const BATCH_LIMIT = Number(process.env.STALE_RUN_SWEEP_LIMIT ?? 200);

function log(message: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  console.log(`[stale-run-sweep] ${message}${suffix}`);
}

async function run() {
  const supabase = createServerClient();
  const dryRun = process.env.STALE_RUN_SWEEP_DRY_RUN === '1';

  const { data, error } = await supabase.rpc('reap_stale_execution_runs', {
    p_stale_after_minutes: STALE_AFTER_MINUTES,
    p_limit: BATCH_LIMIT,
    p_dry_run: dryRun,
  });

  if (error) throw error;

  const reaped = (data ?? []) as ReapedRun[];
  if (reaped.length === 0) {
    log(dryRun ? 'dry run complete' : 'sweep complete', { reaped: 0, staleAfterMinutes: STALE_AFTER_MINUTES });
    return;
  }

  for (const row of reaped) {
    log(dryRun ? 'would cancel stale run' : 'cancelled stale run', {
      runId: row.run_id,
      taskId: row.task_id,
      previousStatus: row.previous_status,
      silentMinutes: row.silent_minutes,
    });

    if (dryRun) continue;

    // Tell whoever was watching. The agent that owned the run is included
    // deliberately: if it is alive but wedged, this is how it finds out its
    // run was taken away.
    const recipients = new Set<string>();
    if (row.agent_id) recipients.add(row.agent_id);

    const { data: members } = await supabase
      .from('project_members')
      .select('agent_id')
      .eq('project_id', row.project_id);
    for (const member of members ?? []) {
      if (member.agent_id) recipients.add(member.agent_id);
    }

    if (recipients.size === 0) continue;

    await deliverWebhooks([...recipients], {
      event: 'task.run_stale',
      contract_id: row.task_id,
      data: {
        run_id: row.run_id,
        task_id: row.task_id,
        project_id: row.project_id,
        agent_id: row.agent_id,
        previous_status: row.previous_status,
        status: 'cancelled',
        heartbeat_at: row.heartbeat_at,
        silent_minutes: row.silent_minutes,
        stale_after_minutes: STALE_AFTER_MINUTES,
        task_released: true,
        // Say what this does and does not assert, so a consumer does not
        // reconcile it as a failure.
        work_failed: false,
        reason: 'run stopped heartbeating; it was cancelled and its task released',
      },
      timestamp: new Date().toISOString(),
    }).catch((deliveryError) => {
      log('failed to deliver stale-run notification', {
        runId: row.run_id,
        error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
      });
    });
  }

  log(dryRun ? 'dry run complete' : 'sweep complete', { reaped: reaped.length });
}

run().catch((error) => {
  console.error('[stale-run-sweep] fatal', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
