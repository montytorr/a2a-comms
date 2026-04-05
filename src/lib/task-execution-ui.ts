import { formatDateTime, formatRelative } from '@/lib/format-date';
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

export function getExecutionStatusTone(status?: TaskExecutionStatus | string | null, stale?: boolean) {
  if (stale) return 'text-red-300 bg-red-500/[0.12] border-red-500/25';
  switch (status) {
    case 'running':
      return 'text-cyan-300 bg-cyan-500/[0.12] border-cyan-500/25';
    case 'queued':
      return 'text-blue-300 bg-blue-500/[0.12] border-blue-500/25';
    case 'paused':
      return 'text-amber-300 bg-amber-500/[0.12] border-amber-500/25';
    case 'handoff-needed':
      return 'text-fuchsia-300 bg-fuchsia-500/[0.12] border-fuchsia-500/25';
    case 'succeeded':
      return 'text-emerald-300 bg-emerald-500/[0.12] border-emerald-500/25';
    case 'failed':
      return 'text-red-300 bg-red-500/[0.12] border-red-500/25';
    case 'cancelled':
      return 'text-gray-300 bg-gray-500/[0.12] border-gray-500/25';
    default:
      return 'text-gray-300 bg-white/[0.04] border-white/[0.08]';
  }
}

export function getExecutionStatusLabel(status?: TaskExecutionStatus | string | null, stale?: boolean) {
  if (!status || status === 'idle') return 'Idle';
  if (stale && (status === 'running' || status === 'queued' || status === 'paused' || status === 'handoff-needed')) {
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
