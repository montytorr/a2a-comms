import { statusTone, type Tone } from '@/lib/status-tone';
import type { TaskExecutionStatus } from '@/lib/types';

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




