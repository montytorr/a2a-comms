import { formatDateTime, formatRelative } from '@/lib/format-date';
import { statusTone, type Tone } from '@/lib/status-tone';
import type { TaskExecutionCheckpoint, TaskExecutionRun, TaskExecutionStatus } from '@/lib/types';

export const STALE_EXECUTION_HEARTBEAT_MS = 15 * 60 * 1000;

export function isExecutionTerminal(status?: string | null) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

export function isExecutionStale(status?: string | null, heartbeatAt?: string | null) {
  if (!status || isExecutionTerminal(status) || status === 'idle') return false;
  if (!heartbeatAt) return true;
  return Date.now() - new Date(heartbeatAt).getTime() > STALE_EXECUTION_HEARTBEAT_MS;
}

/**
 * The tone for an execution status, staleness included.
 *
 * This used to return raw Tailwind colour classes — nine hues, including a
 * fuchsia and a cyan that exist nowhere else in the product — and its only
 * caller then string-matched those class names back into a `var(--token)` to
 * render them. Now it returns a `Tone` and the caller hands it to StatusBadge.
 *
 * A stale run is rose regardless of what it claims to be doing: the heartbeat
 * says nothing is happening, and that outranks the status column.
 */
export function getExecutionStatusTone(
  status?: TaskExecutionStatus | string | null,
  stale?: boolean,
  /** `task-execution` for a task's rolled-up snapshot (it can be `idle`),
   *  `task-execution-run` for one attempt (it can be `starting`). The two maps
   *  agree on every status they share. */
  domain: 'task-execution' | 'task-execution-run' = 'task-execution',
): Tone {
  if (stale) return 'rose';
  return statusTone(domain, status);
}

export function getExecutionStatusLabel(status?: TaskExecutionStatus | string | null, stale?: boolean) {
  if (!status || status === 'idle') return 'Idle';
  if (stale && (status === 'running' || status === 'queued' || status === 'pending-approval' || status === 'waiting' || status === 'blocked' || status === 'paused' || status === 'handoff-needed')) {
    return 'Stale';
  }
  return status.replace(/-/g, ' ');
}

export function formatExecutionTime(value?: string | null) {
  if (!value) return '—';
  return `${formatDateTime(value)} (${formatRelative(value)})`;
}

export function getExecutionSnapshotSummary(task: {
  execution_status?: TaskExecutionStatus | null;
  execution_heartbeat_at?: string | null;
  active_run_id?: string | null;
  last_checkpoint_summary?: string | null;
}) {
  const stale = isExecutionStale(task.execution_status, task.execution_heartbeat_at);
  if (!task.execution_status || task.execution_status === 'idle') return 'No execution run yet.';
  if (stale) return 'Run looks abandoned — heartbeat is older than 15 minutes.';
  if (task.execution_status === 'running' && task.last_checkpoint_summary) return task.last_checkpoint_summary;
  if (task.execution_status === 'running' && task.active_run_id) return 'Run is active and heartbeating.';
  if (task.execution_status === 'queued') return 'Run is queued.';
  if (task.execution_status === 'pending-approval') return 'Run is waiting for approval.';
  if (task.execution_status === 'waiting') return 'Run is waiting on an external dependency.';
  if (task.execution_status === 'blocked') return 'Run is blocked and needs intervention.';
  if (task.execution_status === 'paused') return 'Run is paused.';
  if (task.execution_status === 'handoff-needed') return 'Run is waiting on a handoff.';
  if (task.execution_status === 'succeeded') return 'Latest run finished successfully.';
  if (task.execution_status === 'failed') return 'Latest run failed.';
  if (task.execution_status === 'cancelled') return 'Latest run was cancelled.';
  return 'Execution snapshot available.';
}

export function getRecentExecutionRuns(runs: TaskExecutionRun[], limit = 5) {
  return runs.slice(0, limit);
}

export function getRecentExecutionCheckpoints(checkpoints: TaskExecutionCheckpoint[], limit = 5) {
  return checkpoints.slice(0, limit);
}
