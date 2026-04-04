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
}

export interface BlockedTaskNotificationState {
  tone: BlockerNotificationTone;
  stale: boolean;
  hoursBlocked: number;
  followThroughDue: boolean;
  meta: string;
}

export function getBlockedTaskAgeHours(updatedAt: string | Date, now = new Date()): number {
  const updated = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
}

export function getBlockedTaskNotificationState(
  task: Pick<BlockedTaskNotificationContext, 'updatedAt' | 'blockedByCount' | 'blockingTaskTitles'>,
  now = new Date()
): BlockedTaskNotificationState {
  const hoursBlocked = getBlockedTaskAgeHours(task.updatedAt, now);
  const stale = hoursBlocked >= BLOCKED_TASK_STALE_HOURS;
  const followThroughDue = hoursBlocked >= BLOCKED_TASK_FOLLOW_THROUGH_HOURS;

  const dependencySummary = summarizeBlockingTasks(task.blockingTaskTitles, task.blockedByCount);

  if (stale) {
    return {
      tone: 'stale',
      stale: true,
      hoursBlocked,
      followThroughDue: true,
      meta: `Blocked ${hoursBlocked}h · stale blocker · waiting on ${dependencySummary}`,
    };
  }

  if (followThroughDue) {
    return {
      tone: 'follow-through',
      stale: false,
      hoursBlocked,
      followThroughDue: true,
      meta: `Blocked ${hoursBlocked}h · follow through on ${dependencySummary}`,
    };
  }

  return {
    tone: 'blocked',
    stale: false,
    hoursBlocked,
    followThroughDue: false,
    meta: `Blocked · waiting on ${dependencySummary}`,
  };
}

export function summarizeBlockingTasks(titles: string[], count: number): string {
  const clean = titles.map((title) => title.trim()).filter(Boolean);
  if (clean.length === 0) return count === 1 ? '1 dependency' : `${Math.max(count, 0)} dependencies`;
  if (clean.length === 1 || count <= 1) return clean[0];
  return `${clean[0]} +${Math.max(count - 1, 0)} more`;
}
