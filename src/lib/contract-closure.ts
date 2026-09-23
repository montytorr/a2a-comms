import { deliverWebhooks } from '@/lib/webhooks';
import { createServerClient } from '@/lib/db/server';
import type { ApiError, Contract } from '@/lib/types';

/**
 * Why a contract stopped, which is not the same question as whether its work
 * finished. Consumers reconcile on this rather than on "it closed", because
 * exhausting a turn budget and having the work accepted are opposite outcomes
 * that used to look identical from the outside.
 */
export type ContractCloseOutcome =
  | 'completed-approved'
  | 'turns-exhausted'
  | 'expired'
  | 'closed-by-participant'
  | 'closed-unapproved';

export function resolveCloseOutcome(input: {
  closedBy?: string | null;
  completionApprovedAt?: string | null;
  /** contracts.closed_without_approval. Read from the row, never from
   *  closed_by, which is a free-text actor name. */
  closedWithoutApproval?: boolean | null;
}): ContractCloseOutcome {
  if (input.closedWithoutApproval) return 'closed-unapproved';
  const closedBy = input.closedBy ?? '';
  if (closedBy === 'system:completion-approved') return 'completed-approved';
  if (closedBy === 'system:max-turns') {
    // A gated contract only ever auto-closes on max turns once its approval is
    // recorded, so an approved one that lands here still completed.
    return input.completionApprovedAt ? 'completed-approved' : 'turns-exhausted';
  }
  if (closedBy === 'system:expiry') return 'expired';
  return 'closed-by-participant';
}

/** Does this outcome assert that the work was accepted? */
export function outcomeIsSuccess(outcome: ContractCloseOutcome): boolean {
  return outcome === 'completed-approved';
}

export const UNAPPROVED_CLOSE_REASON_MIN = 10;

export const approvalGateWaysOut = (contractId: string): string =>
  `Two ways out: the proposer approves the work (\`holloway approve-completion ${contractId}\`), ` +
  `or the proposer closes it without approving (\`holloway close ${contractId} --without-approval --reason "..."\`).`;

export type GatedCloseDecision =
  | { allowed: true; closedWithoutApproval: boolean }
  | { allowed: false; status: number; body: ApiError };

/**
 * May this close go ahead, given the completion gate?
 *
 * Before this, a gated contract whose approval never came could not be closed
 * by anyone: it spent its budget and then sat active for good. The proposer is
 * the only party who can decide the work was not accepted, so only the
 * proposer gets the explicit, reasoned way out. An invitee closing would be
 * the invitee declaring its own work finished, which is what the gate exists
 * to prevent.
 */
export function evaluateGatedClose(input: {
  contractId: string;
  gatePending: boolean;
  isProposer: boolean;
  withoutApproval?: boolean;
  reason?: string | null;
}): GatedCloseDecision {
  if (!input.gatePending) return { allowed: true, closedWithoutApproval: false };

  const reason = (input.reason ?? '').trim();
  if (input.isProposer && input.withoutApproval === true && reason.length >= UNAPPROVED_CLOSE_REASON_MIN) {
    return { allowed: true, closedWithoutApproval: true };
  }

  let lead: string;
  if (!input.isProposer) {
    lead = 'This contract requires the proposer to approve completion, and only the proposer can close it before that.';
  } else if (input.withoutApproval === true) {
    lead = `Closing without approval needs a reason of at least ${UNAPPROVED_CLOSE_REASON_MIN} characters saying why the work is not being accepted.`;
  } else {
    lead = 'This contract requires completion approval before it can close.';
  }

  return {
    allowed: false,
    status: 409,
    body: {
      error: `${lead} ${approvalGateWaysOut(input.contractId)}`,
      code: 'COMPLETION_APPROVAL_REQUIRED',
    },
  };
}

export const successorHint = (contractId: string): string =>
  `If the work continues, propose the follow-up with \`holloway propose ... --continues ${contractId}\` so it inherits the task and the chain stays linked.`;

/** Only an ending that left work unaccepted, with nothing yet carrying it on,
 *  needs pointing at the continuation path. */
export function needsSuccessorHint(outcome: ContractCloseOutcome, hasSuccessor: boolean): boolean {
  return !outcomeIsSuccess(outcome) && !hasSuccessor;
}

/**
 * Does something already carry this contract's work on? Same two shapes the
 * protocol inspector checks: a later contract continues or supersedes it (a
 * row pointing TO it), or it delegated execution onward (a row FROM it).
 */
export async function hasSuccessorLink(contractId: string): Promise<boolean> {
  const db = createServerClient();
  const [incoming, outgoing] = await Promise.all([
    db
      .from('contract_links')
      .select('id')
      .eq('to_contract_id', contractId)
      .in('link_type', ['continues', 'supersedes'])
      .limit(1),
    db
      .from('contract_links')
      .select('id')
      .eq('from_contract_id', contractId)
      .eq('link_type', 'delegates_to')
      .limit(1),
  ]);
  return (incoming.data || []).length > 0 || (outgoing.data || []).length > 0;
}

/**
 * Announce a closure to every participant.
 *
 * Five code paths could close a contract and only the explicit close route told
 * anyone: the max-turns and completion-approved closes happen inside
 * insert_message_atomic, and both expiry paths write straight to the database.
 * A contract could therefore go quiet forever with no event, leaving whatever
 * tracked it open and unexplained. Every path calls this now.
 *
 * Fire-and-forget, like the other webhook emissions here: a closure is already
 * committed by the time it is announced, so a failed delivery must not fail the
 * request that caused it.
 */
export async function emitContractClosed(input: {
  contractId: string;
  /** Omit to notify every participant, which is the usual case for a closure. */
  excludeAgentId?: string;
  status: Contract['status'];
  closedBy?: string | null;
  closedByKind?: Contract['closed_by_kind'];
  reason?: string | null;
  currentTurns?: number | null;
  maxTurns?: number | null;
  completionApprovedAt?: string | null;
  closedWithoutApproval?: boolean | null;
}): Promise<void> {
  const db = createServerClient();
  let query = db
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', input.contractId);
  if (input.excludeAgentId) query = query.neq('agent_id', input.excludeAgentId);

  const { data: participants } = await query;
  const recipientIds = (participants || []).map((p) => p.agent_id);
  if (recipientIds.length === 0) return;

  const outcome = resolveCloseOutcome({
    closedBy: input.closedBy,
    completionApprovedAt: input.completionApprovedAt,
    closedWithoutApproval: input.closedWithoutApproval,
  });
  // The link lookup is skipped for an accepted outcome, which never needs one.
  const hasSuccessor = outcomeIsSuccess(outcome)
    || (await hasSuccessorLink(input.contractId).catch(() => false));
  const hint = needsSuccessorHint(outcome, hasSuccessor) ? successorHint(input.contractId) : null;

  await deliverWebhooks(recipientIds, {
    // A contract that never activated expires; one that was live closes.
    event: input.status === 'expired' ? 'contract.expired' : 'contract.closed',
    contract_id: input.contractId,
    data: {
      status: input.status,
      outcome,
      work_accepted: outcomeIsSuccess(outcome),
      closed_by: input.closedBy ?? null,
      closed_by_kind: input.closedByKind ?? null,
      reason: input.reason ?? null,
      current_turns: input.currentTurns ?? null,
      max_turns: input.maxTurns ?? null,
      completion_approved_at: input.completionApprovedAt ?? null,
      closed_without_approval: input.closedWithoutApproval === true,
      successor_hint: hint,
    },
    timestamp: new Date().toISOString(),
  });
}
