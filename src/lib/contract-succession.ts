/**
 * Keeping a contract chain connected at the moment agents act.
 *
 * The guidance to link a continuation to its predecessor, and every contract to
 * a task, lived only in the docs. In practice a gated contract spent its budget,
 * nobody could close it, and its continuation was proposed with no task and no
 * link - so the next reader started from nothing. Everything here either
 * requires the link, inherits it, or says exactly which command records it.
 */

import { pool } from '@/lib/db/client';
import { isContractId } from '@/lib/contract-links';
import { outcomeIsSuccess, resolveCloseOutcome } from '@/lib/contract-closure';
import type { LinkedTaskSummary } from '@/lib/contract-task-link';
import type {
  ApiError,
  ContractStatus,
  LikelyPredecessorSummary,
  RelatedContractSummary,
} from '@/lib/types';

export const UNLINKED_REASON_MIN = 10;
export const LIKELY_PREDECESSOR_WINDOW_DAYS = 14;
export const INVITATION_DESCRIPTION_MAX = 2000;

export type SuccessionLinkType = 'continues' | 'supersedes';

export interface SuccessionRefusal {
  status: number;
  body: ApiError;
}

export interface ProposalSuccessionFields {
  predecessor: { id: string; linkType: SuccessionLinkType } | null;
  /** Trimmed, or null when absent or blank. Length is judged later, only when
   *  it is actually what stands in for a task link. */
  unlinkedReason: string | null;
}

const invalidBody = (error: string): SuccessionRefusal => ({
  status: 400,
  body: { error, code: 'INVALID_BODY' },
});

/** Shape checks on `continues`, `supersedes` and `unlinked_reason`. Pure. */
export function validateProposalSuccession(
  input: unknown
): { ok: true; value: ProposalSuccessionFields } | ({ ok: false } & SuccessionRefusal) {
  const body = (input ?? {}) as Record<string, unknown>;
  const present = (key: string) => body[key] !== undefined && body[key] !== null && body[key] !== '';

  if (present('continues') && present('supersedes')) {
    return {
      ok: false,
      ...invalidBody('Give at most one of continues or supersedes: a contract carries on one predecessor or replaces it, not both.'),
    };
  }

  let predecessor: ProposalSuccessionFields['predecessor'] = null;
  for (const linkType of ['continues', 'supersedes'] as const) {
    if (!present(linkType)) continue;
    const value = body[linkType];
    if (!isContractId(value)) {
      return { ok: false, ...invalidBody(`${linkType} must be the UUID of the earlier contract.`) };
    }
    predecessor = { id: value.trim(), linkType };
  }

  let unlinkedReason: string | null = null;
  if (present('unlinked_reason')) {
    if (typeof body.unlinked_reason !== 'string') {
      return { ok: false, ...invalidBody('unlinked_reason must be a string.') };
    }
    unlinkedReason = body.unlinked_reason.trim() || null;
  }

  return { ok: true, value: { predecessor, unlinkedReason } };
}

export type TaskLinkPlan =
  | { kind: 'task' }
  | { kind: 'inherit'; task: LinkedTaskSummary }
  | { kind: 'unlinked'; reason: string };

/**
 * Where the new contract's task link comes from. Pure.
 *
 * An explicit task wins. A named predecessor with a task hands it down, which
 * is the whole point of `--continues`: the follow-up lands on the same task
 * without the proposer having to look it up. Only when neither exists does the
 * proposer have to say, in words, why this contract belongs to no task.
 */
export function resolveTaskLinkPlan(input: {
  hasTask: boolean;
  unlinkedReason: string | null;
  predecessor: { id: string; linkType: SuccessionLinkType } | null;
  predecessorTask: LinkedTaskSummary | null;
}): { ok: true; plan: TaskLinkPlan } | ({ ok: false } & SuccessionRefusal) {
  if (input.hasTask) return { ok: true, plan: { kind: 'task' } };
  if (input.predecessorTask) return { ok: true, plan: { kind: 'inherit', task: input.predecessorTask } };

  const reason = input.unlinkedReason ?? '';
  if (reason.length >= UNLINKED_REASON_MIN) return { ok: true, plan: { kind: 'unlinked', reason } };

  const lead = input.predecessor
    ? `The contract this one ${input.predecessor.linkType} (${input.predecessor.id}) has no task link to inherit, so this contract needs one of its own or a reason it has none.`
    : 'A contract must be linked to a project task, or say why it is not.';
  const tooShort = reason
    ? ` unlinked_reason must be at least ${UNLINKED_REASON_MIN} characters.`
    : '';

  return {
    ok: false,
    status: 400,
    body: {
      error:
        `${lead}${tooShort} Either link it (project_id + task_id; CLI: \`--project P --task T\`) ` +
        `or explain (unlinked_reason; CLI: \`--unlinked-reason "..."\`). ` +
        'If it carries on an earlier contract, `--continues <id>` inherits that contract\'s task.',
      code: 'CONTRACT_LINK_REQUIRED',
    },
  };
}

export interface PredecessorCandidateRow {
  id: string;
  title: string;
  status: ContractStatus;
  current_turns: number;
  max_turns: number;
  closed_by: string | null;
  completion_approved_at: string | null;
  closed_without_approval: boolean | null;
  participant_ids: string[] | null;
}

const sameSet = (a: string[], b: string[]) => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
};

/**
 * Which candidates look like the contract this proposal carries on. Pure.
 *
 * Same non-observer agents, and the work there was not accepted: either the
 * budget is spent while it is still open (the stuck-gate case), or it ended
 * with any outcome but completed-approved. The query has already dropped
 * anything something continues.
 */
export function filterLikelyPredecessors(
  rows: PredecessorCandidateRow[],
  participantIds: string[]
): LikelyPredecessorSummary[] {
  return rows
    .filter((row) => sameSet(row.participant_ids ?? [], participantIds))
    .filter((row) => {
      if (row.status === 'active') return row.current_turns >= row.max_turns;
      if (row.status !== 'closed' && row.status !== 'expired') return false;
      const outcome = resolveCloseOutcome({
        closedBy: row.closed_by,
        completionApprovedAt: row.completion_approved_at,
        closedWithoutApproval: row.closed_without_approval,
      });
      return !outcomeIsSuccess(outcome);
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      current_turns: row.current_turns,
      max_turns: row.max_turns,
    }));
}

export const successionHint = (newContractId: string, predecessors: LikelyPredecessorSummary[]): string | null => {
  if (predecessors.length === 0) return null;
  const [first] = predecessors;
  const lead =
    predecessors.length === 1
      ? `This looks like it carries on "${first.title}" (${first.id}), which ended without its work being accepted and that nothing continues yet.`
      : `This looks like it carries on one of ${predecessors.length} recent contracts between the same agents that ended without their work being accepted.`;
  return (
    `${lead} If so, record it: \`holloway contract-relate ${newContractId} --to ${first.id} --type continues\`` +
    ' (or --type supersedes if this replaces it). Next time, propose with `--continues <id>` to link it and inherit its task in one step.'
  );
};

/**
 * Recent, unaccepted, un-continued contracts between exactly these agents.
 *
 * One query: the proposer's own non-observer contracts bound the scan, so it
 * never touches the rest of the table. Best effort - a failure here must never
 * fail a proposal it was only trying to help.
 */
export async function findLikelyPredecessors(input: {
  newContractId: string;
  proposerId: string;
  participantIds: string[];
}): Promise<LikelyPredecessorSummary[]> {
  try {
    const { rows } = await pool().query<PredecessorCandidateRow>(
      `select c.id, c.title, c.status, c.current_turns, c.max_turns, c.closed_by,
              c.completion_approved_at, c.closed_without_approval,
              array_agg(cp.agent_id::text) filter (where cp.role <> 'observer') as participant_ids
         from contracts c
         join contract_participants cp on cp.contract_id = c.id
        where c.id in (
                select contract_id from contract_participants
                 where agent_id = $1 and role <> 'observer'
              )
          and c.id <> $2
          and coalesce(c.closed_at, c.updated_at, c.created_at) >= now() - make_interval(days => $3)
          and (c.status in ('closed', 'expired')
               or (c.status = 'active' and c.current_turns >= c.max_turns))
          and not exists (
                select 1 from contract_links l
                 where l.to_contract_id = c.id and l.link_type in ('continues', 'supersedes'))
          and not exists (
                select 1 from contract_links l
                 where l.from_contract_id = c.id and l.link_type = 'delegates_to')
        group by c.id
        order by coalesce(c.closed_at, c.updated_at, c.created_at) desc
        limit 25`,
      [input.proposerId, input.newContractId, LIKELY_PREDECESSOR_WINDOW_DAYS]
    );
    return filterLikelyPredecessors(rows, input.participantIds);
  } catch {
    return [];
  }
}

export const invitationNextAction = (contractId: string): string =>
  `Accept with \`holloway accept ${contractId}\` (or reject with \`holloway reject ${contractId}\` and say why). ` +
  'Once you accept, YOU send the first message — the accepter opens.';

/** Keys every invitation carries, including the server-written handoff ones. */
export const invitationGuidance = (contractId: string) => ({
  next_action: invitationNextAction(contractId),
  opens_after_accept: 'invitee' as const,
});

export const acceptedNextAction = (contractId: string, openerName: string | null): string =>
  openerName
    ? `${openerName} accepted, so ${openerName} opens: send the first message now (\`holloway send ${contractId} --content "..."\`). Everyone else waits for it.`
    : `More than one invitee accepted, so no single opener was named: whoever holds the context sends the first message (\`holloway send ${contractId} --content "..."\`).`;

const truncate = (value: string | null | undefined, max: number): string | null => {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

/**
 * The `invitation` webhook body. Pure.
 *
 * It used to be {title, proposer, expires_at}: an invitee could not tell what
 * it was agreeing to, what task it served, what it continued, or that accepting
 * made it the one who speaks first. The original three keys are unchanged.
 */
export function buildInvitationData(input: {
  contractId: string;
  title: string;
  proposer: string;
  expiresAt: string | null;
  description: string | null;
  maxTurns: number;
  completionRequiresApproval: boolean;
  linkedTask: LinkedTaskSummary | null;
  unlinkedReason: string | null;
  relatedContracts: RelatedContractSummary[];
  likelyPredecessors: LikelyPredecessorSummary[];
}) {
  return {
    title: input.title,
    proposer: input.proposer,
    expires_at: input.expiresAt,
    description: truncate(input.description, INVITATION_DESCRIPTION_MAX),
    max_turns: input.maxTurns,
    completion_requires_approval: input.completionRequiresApproval,
    linked_task: input.linkedTask
      ? { project_id: input.linkedTask.project_id, task_id: input.linkedTask.task_id, title: input.linkedTask.task_title }
      : null,
    unlinked_reason: input.unlinkedReason,
    related_contracts: input.relatedContracts
      .filter((link) => link.direction === 'outgoing' && (link.link_type === 'continues' || link.link_type === 'supersedes'))
      .map((link) => ({ id: link.contract_id, title: link.title, link_type: link.link_type })),
    likely_predecessors: input.likelyPredecessors,
    ...invitationGuidance(input.contractId),
  };
}

/**
 * What the sender can do once a message spends the last turn. Pure.
 *
 * The response used to carry only an `exhausted` header, and a gated contract
 * then sat active with no hint that its proposer had to decide.
 */
export function budgetExhaustedNextSteps(input: {
  contractId: string;
  isProposer: boolean;
  gatePending: boolean;
  completed: boolean;
}): string[] {
  const id = input.contractId;
  if (input.completed) return [];

  const continuation = `If work remains, propose a continuation: \`holloway propose ... --continues ${id}\` (inherits the task and links the chain).`;

  if (input.gatePending && input.isProposer) {
    return [
      `Accept the work: \`holloway approve-completion ${id}\` (closes it as completed-approved).`,
      `Or close it without accepting: \`holloway close ${id} --without-approval --reason "..."\` (outcome closed-unapproved).`,
      continuation,
    ];
  }
  if (input.gatePending) {
    return [
      `The turn budget is spent and this contract cannot complete until the proposer records an approval (\`holloway approve-completion ${id}\`) or closes it without approving. Nothing more can be sent here.`,
      continuation,
    ];
  }
  return [
    'The turn budget is spent and the contract closed as turns-exhausted: the work is not recorded as accepted.',
    continuation,
  ];
}
