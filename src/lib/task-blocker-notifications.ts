export const BLOCKED_TASK_STALE_HOURS = 48;
export const BLOCKED_TASK_FOLLOW_THROUGH_HOURS = 24;

export type BlockerNotificationTone = 'blocked' | 'stale' | 'follow-through';

export interface BlockedTaskNotificationContext {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  blockedByCount: number;
  blockingTaskTitles: string[];
  status: string;
  updatedAt: string;
  blockedAt?: string | null;
  blockerFollowUpAt?: string | null;
  blockerFollowedThroughAt?: string | null;
  blockerEscalatedAt?: string | null;
}

export interface BlockedTaskNotificationState {
  tone: BlockerNotificationTone;
  stale: boolean;
  hoursBlocked: number;
  followThroughDue: boolean;
  meta: string;
  blockedSince: string;
  blockerFollowUpAt: string | null;
  blockerFollowedThroughAt: string | null;
  blockerEscalatedAt: string | null;
}

function toIsoString(value?: string | Date | null): string | null {
  if (!value) return null;
  return (typeof value === 'string' ? new Date(value) : value).toISOString();
}

export function resolveBlockedSince(task: Pick<BlockedTaskNotificationContext, 'blockedAt' | 'updatedAt'>): string {
  return task.blockedAt || task.updatedAt;
}

export function getBlockedTaskAgeHours(blockedSince: string | Date, now = new Date()): number {
  const updated = typeof blockedSince === 'string' ? new Date(blockedSince) : blockedSince;
  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
}

export function getBlockedTaskNotificationState(
  task: Pick<BlockedTaskNotificationContext, 'updatedAt' | 'blockedAt' | 'blockedByCount' | 'blockingTaskTitles' | 'blockerFollowUpAt' | 'blockerFollowedThroughAt' | 'blockerEscalatedAt'>,
  now = new Date()
): BlockedTaskNotificationState {
  const blockedSince = resolveBlockedSince(task);
  const hoursBlocked = getBlockedTaskAgeHours(blockedSince, now);
  const stale = hoursBlocked >= BLOCKED_TASK_STALE_HOURS;
  const dependencySummary = summarizeBlockingTasks(task.blockingTaskTitles, task.blockedByCount);
  const blockerFollowUpAt = toIsoString(task.blockerFollowUpAt);
  const blockerFollowedThroughAt = toIsoString(task.blockerFollowedThroughAt);
  const blockerEscalatedAt = toIsoString(task.blockerEscalatedAt);
  const followThroughDue = !blockerFollowedThroughAt && hoursBlocked >= BLOCKED_TASK_FOLLOW_THROUGH_HOURS;

  if (stale) {
    const meta = blockerEscalatedAt
      ? `Blocked ${hoursBlocked}h · escalated after follow-through on ${dependencySummary}`
      : `Blocked ${hoursBlocked}h · stale blocker · escalate ${dependencySummary}`;
    return {
      tone: 'stale',
      stale: true,
      hoursBlocked,
      followThroughDue,
      meta,
      blockedSince,
      blockerFollowUpAt,
      blockerFollowedThroughAt,
      blockerEscalatedAt,
    };
  }

  if (followThroughDue) {
    const meta = blockerFollowUpAt
      ? `Blocked ${hoursBlocked}h · follow through again on ${dependencySummary}`
      : `Blocked ${hoursBlocked}h · follow through on ${dependencySummary}`;
    return {
      tone: 'follow-through',
      stale: false,
      hoursBlocked,
      followThroughDue: true,
      meta,
      blockedSince,
      blockerFollowUpAt,
      blockerFollowedThroughAt,
      blockerEscalatedAt,
    };
  }

  const meta = blockerFollowedThroughAt
    ? `Blocked · follow-through logged for ${dependencySummary}`
    : `Blocked · waiting on ${dependencySummary}`;

  return {
    tone: 'blocked',
    stale: false,
    hoursBlocked,
    followThroughDue: false,
    meta,
    blockedSince,
    blockerFollowUpAt,
    blockerFollowedThroughAt,
    blockerEscalatedAt,
  };
}

export function summarizeBlockingTasks(titles: string[], count: number): string {
  const clean = titles.map((title) => title.trim()).filter(Boolean);
  if (clean.length === 0) return count === 1 ? '1 dependency' : `${Math.max(count, 0)} dependencies`;
  if (clean.length === 1 || count <= 1) return clean[0];
  return `${clean[0]} +${Math.max(count - 1, 0)} more`;
}
