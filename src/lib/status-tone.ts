// ============================================================
// Holloway — Status → tone: the single source of truth
// ============================================================
//
// THE RULE
// --------
// A tone is a *meaning*, not a decoration. The same logical state must wear
// the same tone on every page, for every entity. There are exactly five:
//
//   mint    — healthy / finished successfully. The thing reached its good end.
//   amber   — in flight, or waiting on a human. Something is happening, or
//             will not happen until you act. Amber is the only tone that
//             pulses; it is the "look here" tone and must stay scarce.
//   peri    — queued / accepted but not started. Parked, nothing wrong.
//   rose    — failed / blocked / rejected / expired. The thing went wrong or
//             ran out of time.
//   neutral — inert. Cancelled, archived, never scheduled, no run yet. The
//             absence of a state worth colouring.
//
// Consequences of the rule that were previously violated:
//   * `expired` is rose everywhere. It used to be rose on contracts and grey
//     on project invitations, though it means the same thing in both.
//   * `active` is amber everywhere (work in flight). The analytics donut had
//     it mint, which is the tone reserved for "finished well".
//   * `planning` / `planned` / `todo` / `queued` are peri: scheduled, not
//     started. `active` and `in-progress` are amber. Before this, projects
//     painted `planning` and `active` the same amber, so the pill could not
//     tell you whether a project had started.
//   * `backlog` is neutral, not peri: it is not queued, it is unscheduled.
//     `todo` is the queued one. That is the only distinction between those two
//     columns, so it has to carry.
//
// Every map below is a total `Record<Union, Tone>`. Adding a status to a union
// in types.ts is a build error here until someone decides what it means. That
// is the point: the four maps this file replaced were all partial, and each
// one fell back to a different default.
// ============================================================

import type {
  ApprovalStatus,
  ContractStatus,
  MessageType,
  OperatorQuestionStatus,
  ParticipantStatus,
  ProjectInvitationStatus,
  ProjectStatus,
  SprintStatus,
  TaskCheckpointStatus,
  TaskExecutionRunStatus,
  TaskExecutionStatus,
  TaskPriority,
  TaskStatus,
  WebhookDeliveryStatus,
} from '@/lib/types';
import type { BlockedTaskNotificationState, BlockerNotificationTone } from '@/lib/task-blocker-notifications';

type BlockerDueState = BlockedTaskNotificationState['dueState'];

export type Tone = 'mint' | 'amber' | 'peri' | 'rose' | 'neutral';

// ---- Per-entity maps ----------------------------------------

/** A contract's life. `closed` is the *successful* terminal state — a contract
 *  that ran its course and was closed on purpose — so it is mint, not grey.
 *  `cancelled` is the neutral terminal state: called off, no verdict. */
export const CONTRACT_STATUS_TONE: Record<ContractStatus, Tone> = {
  proposed: 'amber',   // waiting on the invitee to accept or reject
  active: 'amber',     // in flight
  rejected: 'rose',
  expired: 'rose',     // ran out of time — a failure to reach an end
  cancelled: 'neutral',
  closed: 'mint',
};

export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = {
  planning: 'peri',    // scheduled, not started
  active: 'amber',
  completed: 'mint',
  archived: 'neutral',
};

export const SPRINT_STATUS_TONE: Record<SprintStatus, Tone> = {
  planned: 'peri',
  active: 'amber',
  completed: 'mint',
};

/** `backlog` is unscheduled (neutral); `todo` is queued (peri). `in-review`
 *  is amber because it is waiting on a person, which is the same class of
 *  "needs you" as `in-progress` is "in flight". */
export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  backlog: 'neutral',
  todo: 'peri',
  'in-progress': 'amber',
  'in-review': 'amber',
  done: 'mint',
  cancelled: 'neutral',
};

/** An agent run attached to a task. `waiting` is peri rather than rose: the
 *  run is parked on an external dependency and nothing has gone wrong.
 *  `blocked` is rose — it needs intervention. `paused` and `handoff-needed`
 *  are amber: they will not move until a human does something. */
export const TASK_EXECUTION_STATUS_TONE: Record<TaskExecutionStatus, Tone> = {
  idle: 'neutral',     // no run has ever started
  queued: 'peri',
  running: 'amber',
  'pending-approval': 'amber',
  waiting: 'peri',
  blocked: 'rose',
  paused: 'amber',
  'handoff-needed': 'amber',
  succeeded: 'mint',
  failed: 'rose',
  cancelled: 'neutral',
};

/** One attempt of the above. Same meanings; `starting` is in flight, and
 *  there is no `idle` because a run row only exists once it is queued. */
export const TASK_EXECUTION_RUN_STATUS_TONE: Record<TaskExecutionRunStatus, Tone> = {
  queued: 'peri',
  starting: 'amber',
  running: 'amber',
  'pending-approval': 'amber',
  waiting: 'peri',
  blocked: 'rose',
  paused: 'amber',
  'handoff-needed': 'amber',
  succeeded: 'mint',
  failed: 'rose',
  cancelled: 'neutral',
};

export const TASK_CHECKPOINT_STATUS_TONE: Record<TaskCheckpointStatus, Tone> = {
  written: 'mint',
  superseded: 'neutral', // still true history, no longer the current answer
};

/** `approved` is the healthy outcome; `consumed` is that same approval after
 *  it was spent, so it is history — inert, not a fifth kind of success. The
 *  four states have to be tellable apart at a glance because this list is the
 *  kill-switch queue, which is why `consumed` is not also mint. */
export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, Tone> = {
  pending: 'amber',    // waiting on a reviewer
  approved: 'mint',
  denied: 'rose',
  consumed: 'neutral',
};

export const WEBHOOK_DELIVERY_STATUS_TONE: Record<WebhookDeliveryStatus, Tone> = {
  pending: 'peri',        // queued for a first attempt
  pending_retry: 'amber', // an attempt failed and another is coming
  retrying: 'amber',      // in flight
  success: 'mint',
  failed: 'rose',
};

export const PARTICIPANT_STATUS_TONE: Record<ParticipantStatus, Tone> = {
  pending: 'amber',    // the invitee has not answered
  accepted: 'mint',
  rejected: 'rose',
};

export const PROJECT_INVITATION_STATUS_TONE: Record<ProjectInvitationStatus, Tone> = {
  pending: 'amber',
  accepted: 'mint',
  declined: 'rose',
  cancelled: 'neutral',
  expired: 'rose',     // same meaning, same tone, as a contract's `expired`
};

export const OPERATOR_QUESTION_STATUS_TONE: Record<OperatorQuestionStatus, Tone> = {
  open: 'amber',       // an agent is waiting on a person
  answered: 'mint',
  dismissed: 'neutral',
};

/** NOT a status. A message's `message_type` is a *kind*, and it is rendered in
 *  the same pill as statuses are, so it has to draw from the same palette or
 *  the palette stops meaning anything. The mapping here is deliberately dull:
 *  nothing about a message type is healthy, failed or in flight, so the only
 *  tones used are peri (this message expects something back) and neutral. */
export const MESSAGE_TYPE_TONE: Record<MessageType, Tone> = {
  message: 'neutral',
  request: 'peri',     // expects a response
  response: 'neutral',
  update: 'neutral',
  status: 'neutral',
  receipt: 'neutral',
  approval: 'peri',    // gates something
};

/** NOT a status either, and deliberately kept out of `STATUS_TONES` below so
 *  that nothing can look a priority up as if it were a lifecycle state. It is
 *  here because two pages carried byte-identical copies of it next to their
 *  status maps, which is the same failure mode; and because it has to share
 *  the palette, a severity ramp reads as an inverted lifecycle: `urgent` is
 *  rose (this is going wrong), `low` is inert. */
export const TASK_PRIORITY_TONE: Record<TaskPriority, Tone> = {
  urgent: 'rose',
  high: 'amber',
  medium: 'peri',
  low: 'neutral',
};

export function taskPriorityTone(priority: string | null | undefined): Tone {
  if (!priority) return 'neutral';
  return (TASK_PRIORITY_TONE as Record<string, Tone>)[priority] ?? 'neutral';
}

/** A blocked task's escalation state. `stale` and `blocked` are both rose —
 *  the task is not moving — and `follow-through` is amber because a person has
 *  committed to an unblock step and owes it. Lived as an identical ternary in
 *  the project board and projects/[id]/page.tsx. */
export const BLOCKER_TONE: Record<BlockerNotificationTone, Tone> = {
  blocked: 'rose',
  stale: 'rose',
  'follow-through': 'amber',
};

/** How a follow-up commitment is tracking against its due date. */
export const DUE_STATE_TONE: Record<BlockerDueState, Tone> = {
  none: 'neutral',
  scheduled: 'mint',   // on track
  'due-soon': 'amber',
  overdue: 'rose',
};

/** How one task relates to another. Not a status, but rendered in the same
 *  pill, and it lived twice — the project board and tasks/[tid]/page.tsx — with
 *  the two copies disagreeing about `related`, which one painted mint (the
 *  "finished well" tone) and the other grey. A relationship is not an outcome:
 *  only `blockedBy` and `blocks` carry a state worth colouring. */
export const DEPENDENCY_KIND_TONE = {
  blockedBy: 'rose',
  blocks: 'amber',
  sequenceAfter: 'peri',
  sequenceBefore: 'peri',
  related: 'neutral',
} as const satisfies Record<string, Tone>;

export type DependencyKind = keyof typeof DEPENDENCY_KIND_TONE;

// ---- Domain lookup ------------------------------------------

export const STATUS_TONES = {
  contract: CONTRACT_STATUS_TONE,
  project: PROJECT_STATUS_TONE,
  sprint: SPRINT_STATUS_TONE,
  task: TASK_STATUS_TONE,
  'task-execution': TASK_EXECUTION_STATUS_TONE,
  'task-execution-run': TASK_EXECUTION_RUN_STATUS_TONE,
  'task-checkpoint': TASK_CHECKPOINT_STATUS_TONE,
  approval: APPROVAL_STATUS_TONE,
  'webhook-delivery': WEBHOOK_DELIVERY_STATUS_TONE,
  participant: PARTICIPANT_STATUS_TONE,
  'project-invitation': PROJECT_INVITATION_STATUS_TONE,
  'operator-question': OPERATOR_QUESTION_STATUS_TONE,
  'message-type': MESSAGE_TYPE_TONE,
} as const satisfies Record<string, Record<string, Tone>>;

export type StatusDomain = keyof typeof STATUS_TONES;

export const STATUS_DOMAINS = Object.keys(STATUS_TONES) as StatusDomain[];

/** The statuses of one domain, in the order they were declared — which is
 *  lifecycle order, so it is also the order a chart legend should use. */
export function statusesOf(domain: StatusDomain): string[] {
  return Object.keys(STATUS_TONES[domain]);
}

/**
 * The tone for a status.
 *
 * Takes `string` because almost every caller gets its status out of Postgres
 * as text. The *maps* are exhaustive over the unions, which is where the
 * compile-time guarantee lives; this is the runtime edge, and an unrecognised
 * status is inert rather than a crash or a surprise colour.
 */
export function statusTone(domain: StatusDomain, status: string | null | undefined): Tone {
  if (!status) return 'neutral';
  const map: Record<string, Tone> = STATUS_TONES[domain];
  return map[status] ?? 'neutral';
}

/**
 * Domains in the order `looseStatusTone` consults them. Order only matters for
 * a status word that means different things in different entities, and there is
 * exactly one: `pending`. An approval or an invitation that is pending is
 * waiting on a person (amber); a webhook delivery that is pending is merely
 * queued by the system (peri). Human-facing meanings come first, because the
 * strings this resolver sees were written for people.
 */
const LOOSE_DOMAIN_ORDER: readonly StatusDomain[] = [
  'task',
  'contract',
  'participant',
  'approval',
  'project',
  'sprint',
  'task-execution',
  'task-execution-run',
  'project-invitation',
  'operator-question',
  'webhook-delivery',
  'task-checkpoint',
];

/** Agent-authored spellings that are not any of our statuses but plainly mean
 *  one of them. Kept short on purpose: the answer to a new one is usually a
 *  real status, not another alias. */
const LOOSE_ALIASES: Record<string, Tone> = {
  confirmed: 'mint',
  'both-tasks-done': 'mint',
};

/**
 * Tone for a status string that is *not* one of ours — a value lifted out of an
 * agent-authored message payload, where casing and separators are whatever the
 * agent chose. It is normalised (`In_Progress` → `in-progress`) and then looked
 * up across the real domains, so a payload that happens to say `active` or
 * `failed` is coloured like the product's own `active` and `failed` instead of
 * getting a private palette.
 *
 * The version this replaced fell back to a tone literally named `fg`, which it
 * then interpolated into `var(--fg)` — a token that does not exist — so an
 * unrecognised status rendered with no border and no colour at all.
 */
export function looseStatusTone(raw: string | null | undefined): Tone {
  if (!raw) return 'neutral';
  const lower = raw.trim().toLowerCase();
  // Our own statuses are spelled both ways — `in-progress` with a hyphen,
  // `pending_retry` with an underscore — so a normalised key has to be tried
  // against both spellings or the underscored ones are unreachable.
  const candidates = [lower, lower.replace(/_/g, '-'), lower.replace(/-/g, '_')];
  for (const key of candidates) {
    if (LOOSE_ALIASES[key]) return LOOSE_ALIASES[key];
  }
  for (const domain of LOOSE_DOMAIN_ORDER) {
    const map = STATUS_TONES[domain] as Record<string, Tone>;
    for (const key of candidates) {
      if (map[key]) return map[key];
    }
  }
  return 'neutral';
}

/**
 * An HTTP response code is not a status of ours, but it is rendered beside
 * delivery statuses and has to agree with them: a 2xx is the same mint as
 * `success`, a 4xx/5xx the same rose as `failed`. Two pages had this as
 * differing inline ternaries — one painted 3xx amber, the other painted every
 * non-2xx rose.
 */
export function httpStatusTone(code: number | null | undefined): Tone {
  if (!code) return 'neutral';
  if (code >= 200 && code < 300) return 'mint';
  if (code >= 400) return 'rose';
  return 'amber'; // 1xx/3xx — answered, but not with the answer we wanted
}

// ---- Tone → presentation ------------------------------------
//
// globals.css owns the actual colours. `neutral` has no `--ghost` token: it
// is the `pill--ghost` / bare `dot` pairing, so it needs its own row in each
// of these rather than a `--${tone}` template.

const TONE_PILL: Record<Tone, string> = {
  mint: 'pill pill--mint',
  amber: 'pill pill--amber',
  peri: 'pill pill--peri',
  rose: 'pill pill--rose',
  neutral: 'pill pill--ghost',
};

const TONE_DOT: Record<Tone, string> = {
  mint: 'dot dot--mint',
  amber: 'dot dot--amber',
  peri: 'dot dot--peri',
  rose: 'dot dot--rose',
  neutral: 'dot',
};

const TONE_COLOR: Record<Tone, string> = {
  mint: 'var(--mint)',
  amber: 'var(--amber)',
  peri: 'var(--peri)',
  rose: 'var(--rose)',
  neutral: 'var(--fg-3)',
};

const TONE_SURFACE: Record<Tone, string> = {
  mint: 'var(--mint-bg)',
  amber: 'var(--amber-bg)',
  peri: 'var(--peri-bg)',
  rose: 'var(--rose-bg)',
  neutral: 'var(--bg-1)',
};

const TONE_LINE: Record<Tone, string> = {
  mint: 'var(--mint-line)',
  amber: 'var(--amber-line)',
  peri: 'var(--peri-line)',
  rose: 'var(--rose-line)',
  neutral: 'var(--line-1)',
};

/** `pill pill--x`, for a chip. */
export function pillClassForTone(tone: Tone): string {
  return TONE_PILL[tone];
}

/** `dot dot--x`, for the marker inside a chip or a column heading. */
export function dotClassForTone(tone: Tone): string {
  return TONE_DOT[tone];
}

/** The foreground token, for text and SVG fills that cannot take a class. */
export function colorVarForTone(tone: Tone): string {
  return TONE_COLOR[tone];
}

/** The tinted-surface token, for a panel that wants to carry the tone. */
export function surfaceVarForTone(tone: Tone): string {
  return TONE_SURFACE[tone];
}

/** The border token that pairs with `surfaceVarForTone`. */
export function lineVarForTone(tone: Tone): string {
  return TONE_LINE[tone];
}

/**
 * Amber is the only tone that animates. Every amber status is either moving or
 * waiting on a person, and both of those are things the eye should be pulled
 * to; nothing else is. Keeping the rule "amber pulses" rather than a second
 * list of pulsing statuses means the animation cannot drift from the colour.
 */
export function tonePulses(tone: Tone): boolean {
  return tone === 'amber';
}

/** `in-progress` → `in progress`, `pending_retry` → `pending retry`. */
export function statusLabel(status: string | null | undefined, fallback = 'unknown'): string {
  if (!status) return fallback;
  return status.replace(/[-_]/g, ' ');
}

// ---- Charts -------------------------------------------------
//
// A donut or a stacked bar needs its slices tellable apart, and after the
// unification several statuses in one entity legitimately share a tone
// (`proposed` and `active` are both amber; `rejected` and `expired` are both
// rose). Rather than give one of them a different meaning, the hue stays and
// the *shade* steps: same tone, stepped toward the surface. Hue still answers
// "is this good, bad, or busy"; shade only separates neighbours.

/** `shade` 0 is the tone itself; each step mixes it further into the panel.
 *  The ladder is geometric rather than linear so that it never has to clamp —
 *  a clamp would hand two statuses the same fill, which is the one thing a
 *  chart legend cannot survive. The largest domain has eleven statuses, and
 *  eleven steps still land on distinct weights. */
export function chartFillForTone(tone: Tone, shade = 0): string {
  const base = colorVarForTone(tone);
  if (shade <= 0) return base;
  const weight = Math.round(100 * 0.78 ** shade * 10) / 10;
  return `color-mix(in oklab, ${base} ${weight}%, var(--bg-1))`;
}

/**
 * Status → chart fill for one domain, shaded so that statuses sharing a tone
 * get distinguishable shades of it. Derived from the tone map's own key order,
 * so the colours are stable no matter what order the data arrives in.
 */
export function chartFillMap(domain: StatusDomain): Record<string, string> {
  const used: Partial<Record<Tone, number>> = {};
  const fills: Record<string, string> = {};
  for (const [status, tone] of Object.entries(STATUS_TONES[domain]) as [string, Tone][]) {
    const shade = used[tone] ?? 0;
    used[tone] = shade + 1;
    fills[status] = chartFillForTone(tone, shade);
  }
  return fills;
}
