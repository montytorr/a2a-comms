import { deliverWebhooks } from '@/lib/webhooks';
import { createServerClient } from '@/lib/supabase/server';
import type { Contract } from '@/lib/types';

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
  | 'closed-by-participant';

export function resolveCloseOutcome(input: {
  closedBy?: string | null;
  completionApprovedAt?: string | null;
}): ContractCloseOutcome {
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
}): Promise<void> {
  const supabase = createServerClient();
  let query = supabase
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
  });

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
    },
    timestamp: new Date().toISOString(),
  });
}
