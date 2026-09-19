/**
 * The side-channel between the humans and the agents on a contract.
 *
 * Contracts are agent-only by construction: every `/api/v1` route authenticates
 * with HMAC and there is no session path into it, so a human cannot write a
 * contract message without holding an agent's signing secret. On a task an
 * operator can at least leave a comment an agent might find. On a contract
 * there was nothing.
 *
 * Two directions, deliberately asymmetric because they are not the same act:
 *
 *   NOTES      human -> agent. Standing instructions. Plural, durable, re-read
 *              on every contract read rather than delivered once - so a note
 *              written now takes effect the next time an agent looks, and never
 *              interrupts, never consumes a turn, never wakes anything.
 *
 *   QUESTIONS  agent -> human. One-shot, with a state and an answer. The thing
 *              an agent has never been able to do: stop and ask. Today a worker
 *              that says it is stuck prints neither sanctioned marker, is
 *              classified WORKER INCOMPLETE, and is retried every fifteen
 *              minutes for twenty-four hours. Being blocked is indistinguish-
 *              able from crashing.
 *
 * The rules live here rather than at each call site so the agent-facing routes,
 * the dashboard server actions and the CLI cannot drift - the same reason
 * `contract-links.ts` and `contract-task-link.ts` exist.
 */

import type {
  ApiError,
  OperatorChannelCounts,
  OperatorNoteSummary,
  OperatorQuestionKind,
  OperatorQuestionSummary,
} from '@/lib/types';

export const OPERATOR_QUESTION_KINDS: readonly OperatorQuestionKind[] = [
  'question',
  'validation',
  'blocked',
] as const;

/**
 * A note is context an agent re-reads on every look, so it has to stay cheap to
 * carry. Long enough for a paragraph of standing instruction and a couple of
 * links; not long enough to become a second contract description.
 */
export const CONTRACT_NOTE_BODY_MAX = 4000;
export const CONTRACT_QUESTION_BODY_MAX = 2000;
export const CONTRACT_ANSWER_MAX = 4000;

export function isOperatorQuestionKind(value: unknown): value is OperatorQuestionKind {
  return typeof value === 'string' && (OPERATOR_QUESTION_KINDS as readonly string[]).includes(value);
}

/** One line per kind, shared by the CLI help and the dashboard. */
export function describeQuestionKind(kind: OperatorQuestionKind): string {
  return {
    question: 'You would like an answer but can carry on without one.',
    validation: 'You have done something and want a person to confirm it before it counts as done.',
    blocked: 'You cannot proceed at all until a person responds.',
  }[kind];
}

/**
 * Whether a kind normally means the agent has stopped. The agent may override
 * it: `blocking` is stored explicitly because only the agent knows whether it
 * can carry on, and deriving it from the kind would be guessing on its behalf.
 */
export function defaultBlockingForKind(kind: OperatorQuestionKind): boolean {
  return kind === 'blocked';
}

export interface ChannelRefusal {
  status: number;
  body: ApiError;
}

export function refuse(status: number, error: string, code: string, details?: string): ChannelRefusal {
  return { status, body: { error, code, ...(details ? { details } : {}) } satisfies ApiError };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * The `.or()`/`.in()` filters are built by string interpolation, so only
 * well-formed UUIDs are allowed through. Today every caller passes ids that came
 * out of the database, but that is a property of today's callers.
 */
export function safeIdList(ids: string[]): string[] {
  return ids.filter((id) => UUID.test(id));
}

/* ── validation ──────────────────────────────────────────────────────────── */

/**
 * A body that is only whitespace is refused rather than stored, because an
 * empty standing instruction is indistinguishable from a mistake and an agent
 * re-reading it every turn would have to decide which.
 */
function validateBody(
  raw: unknown,
  field: string,
  max: number
): { ok: true; value: string } | ({ ok: false } & ChannelRefusal) {
  if (typeof raw !== 'string') {
    return { ok: false, ...refuse(400, `${field} is required and must be a string.`, 'VALIDATION_ERROR') };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, ...refuse(400, `${field} cannot be empty.`, 'VALIDATION_ERROR') };
  }
  if (value.length > max) {
    return {
      ok: false,
      ...refuse(400, `${field} is ${value.length} characters; the maximum is ${max}.`, 'VALIDATION_ERROR'),
    };
  }
  return { ok: true, value };
}

export function validateNoteBody(raw: unknown) {
  return validateBody(raw, 'body', CONTRACT_NOTE_BODY_MAX);
}

export function validateAnswerBody(raw: unknown) {
  return validateBody(raw, 'answer', CONTRACT_ANSWER_MAX);
}

export interface ValidatedQuestion {
  kind: OperatorQuestionKind;
  body: string;
  blocking: boolean;
}

export function validateQuestionRequest(
  input: unknown
): { ok: true; value: ValidatedQuestion } | ({ ok: false } & ChannelRefusal) {
  const raw = (input ?? {}) as Record<string, unknown>;

  const kind = raw.kind === undefined ? 'question' : raw.kind;
  if (!isOperatorQuestionKind(kind)) {
    return {
      ok: false,
      ...refuse(
        400,
        `kind must be one of: ${OPERATOR_QUESTION_KINDS.join(', ')}.`,
        'VALIDATION_ERROR',
        OPERATOR_QUESTION_KINDS.map((k) => `${k} - ${describeQuestionKind(k)}`).join(' '),
      ),
    };
  }

  const body = validateBody(raw.body, 'body', CONTRACT_QUESTION_BODY_MAX);
  if (!body.ok) return body;

  const blocking =
    typeof raw.blocking === 'boolean' ? raw.blocking : defaultBlockingForKind(kind);

  return { ok: true, value: { kind, body: body.value, blocking } };
}

/* ── shaping ─────────────────────────────────────────────────────────────── */

/**
 * Counts for a list read. The bodies are deliberately not carried into a list:
 * a page of forty contracts would become a transcript, and the agent that needs
 * the text is about to read the contract itself anyway.
 */
export function summariseChannel(
  notes: OperatorNoteSummary[],
  questions: OperatorQuestionSummary[],
  viewerIdentified: boolean
): OperatorChannelCounts {
  const live = notes.filter((note) => note.withdrawn_at === null);
  const open = questions.filter((question) => question.status === 'open');
  return {
    notes: live.length,
    unacknowledged_notes: viewerIdentified
      ? live.filter((note) => note.acknowledged !== true).length
      : null,
    open_questions: open.length,
    blocking_questions: open.filter((question) => question.blocking).length,
  };
}

/**
 * The one-line nudge printed after a send and at the top of an inbox. Returns
 * null when there is nothing to say, so callers can print it unconditionally.
 */
export function describeChannelState(counts: OperatorChannelCounts | null | undefined): string | null {
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.unacknowledged_notes) {
    parts.push(
      `${counts.unacknowledged_notes} operator note${counts.unacknowledged_notes === 1 ? '' : 's'} you have not acknowledged`,
    );
  }
  if (counts.open_questions) {
    const blocking = counts.blocking_questions
      ? `, ${counts.blocking_questions} blocking`
      : '';
    parts.push(`${counts.open_questions} open question${counts.open_questions === 1 ? '' : 's'} to a human${blocking}`);
  }
  return parts.length ? parts.join('; ') : null;
}

/**
 * Everything above is pure: no database client, no server-only import. The
 * dashboard's operator-channel panel is a client component and imports the
 * limits and the kind descriptions from here, and a single `@/lib/db/server`
 * import in this file would bundle `pg` for the browser. The queries live in
 * `contract-operator-channel-server.ts`, on the same split as `pulse.ts`.
 */
