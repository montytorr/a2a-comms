import { createServerClient } from '@/lib/supabase/server';
import { emitContractClosed } from '@/lib/contract-closure';
import { getLinkedTask } from '@/lib/contract-task-link';
import { getRelatedContracts } from '@/lib/contract-links';
import { deriveContractTurnState, type TurnStateLastMessage } from '@/lib/contract-turn-state';
import type { Contract, ContractResponse, RelatedContractSummary } from '@/lib/types';
import { listAttachmentsForScope } from '@/lib/attachment-access';

/**
 * Check if a contract has expired. If so, auto-close it in the DB and return the updated record.
 */
export async function autoCloseIfExpired(contract: Contract): Promise<Contract> {
  if (
    (contract.status === 'proposed' || contract.status === 'active') &&
    contract.expires_at &&
    new Date(contract.expires_at) < new Date()
  ) {
    const newStatus = contract.status === 'proposed' ? 'expired' : 'closed';
    const closeReason =
      contract.status === 'proposed'
        ? 'Expired before activation'
        : 'Contract expired';

    const supabase = createServerClient();
    const { data: updated } = await supabase
      .from('contracts')
      .update({
        status: newStatus,
        close_reason: closeReason,
        closed_by: 'system:expiry',
        closed_by_kind: 'system',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id)
      .select()
      .single();

    const closed = (updated as Contract) || { ...contract, status: newStatus, close_reason: closeReason };

    // Expiry used to be entirely silent: the row changed and nobody was told,
    // so whatever was tracking the contract waited forever for a conversation
    // that had already ended.
    emitContractClosed({
      contractId: contract.id,
      status: newStatus,
      closedBy: 'system:expiry',
      closedByKind: 'system',
      reason: closeReason,
      currentTurns: closed.current_turns,
      maxTurns: closed.max_turns,
      completionApprovedAt: closed.completion_approved_at,
    }).catch(() => {});

    return closed;
  }

  return contract;
}

/**
 * The last message of each of these contracts, keyed by contract id.
 *
 * One row per contract in a single pass. Doing it in the query builder would be
 * either a query per contract or a fetch of every message on the page, so the
 * DISTINCT ON lives in SQL (latest_contract_messages).
 */
export async function getLastMessages(
  contractIds: string[]
): Promise<Map<string, TurnStateLastMessage>> {
  const out = new Map<string, TurnStateLastMessage>();
  if (contractIds.length === 0) return out;

  const supabase = createServerClient();
  const { data } = await supabase.rpc('latest_contract_messages', { p_contract_ids: contractIds });

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    out.set(row.contract_id as string, {
      sender_id: row.sender_id as string,
      message_type: row.message_type as string,
      requires_action: (row.requires_action as boolean | null) ?? null,
      consumes_turn: (row.consumes_turn as boolean | null) ?? null,
      created_at: row.created_at as string,
    });
  }

  return out;
}

export interface EnrichOptions {
  /** Links already fetched for a whole page, to avoid a query per row. */
  relatedContracts?: RelatedContractSummary[];
  /** Who is asking. Without it there is no "your move" to report. */
  viewerAgentId?: string | null;
  /** The contract's last message, when the caller already has it. */
  lastMessage?: TurnStateLastMessage | null;
  /** True when `lastMessage` was looked up and there is none. */
  lastMessageResolved?: boolean;
}

/**
 * Enrich a contract row with proposer and participants info for API response.
 *
 * Anything the caller already has - links for a page, the last message - can be
 * passed in. Left out, each is fetched for the single contract: correct either
 * way, but a list of a hundred rows should not make a hundred round trips.
 */
export async function enrichContract(
  contract: Contract,
  options: EnrichOptions = {}
): Promise<ContractResponse> {
  const supabase = createServerClient();

  // Fetch proposer
  const { data: proposer } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .eq('id', contract.proposer_id)
    .single();

  // Fetch participants with agent info
  const { data: participantRows } = await supabase
    .from('contract_participants')
    .select('agent_id, role, status')
    .eq('contract_id', contract.id);

  const agentIds = (participantRows || []).map((p) => p.agent_id);
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .in('id', agentIds);

  const agentMap = new Map((agents || []).map((a) => [a.id, a]));

  const participants = (participantRows || []).map((p) => ({
    agent: agentMap.get(p.agent_id) || { id: p.agent_id, name: 'unknown', display_name: 'Unknown' },
    role: p.role as 'proposer' | 'invitee' | 'observer',
    status: p.status as 'pending' | 'accepted' | 'rejected',
  }));

  // The link is what gives the contract a project, so it decides where
  // attachments live — and it is worth returning in its own right, since
  // otherwise an agent holding a contract has no way to discover it.
  const linkedTask = await getLinkedTask(contract.id);
  const attachments = linkedTask
    ? await listAttachmentsForScope({ projectId: linkedTask.project_id, contractId: contract.id, includeSignedUrl: true }).catch(() => [])
    : [];

  // Whose move it is, from the asker's point of view. The field is always
  // present; it is null only when the caller could not be identified, which no
  // authenticated route should hit. The comment here used to claim the field
  // was omitted in that case - it never was, and a client written to test for
  // its presence would have been wrong.
  let turnState = null;
  if (options.viewerAgentId) {
    const lastMessage = options.lastMessageResolved
      ? options.lastMessage ?? null
      : (await getLastMessages([contract.id])).get(contract.id) ?? null;
    turnState = deriveContractTurnState({
      contract,
      viewerAgentId: options.viewerAgentId,
      participants: (participantRows || []).map((p) => ({
        agent_id: p.agent_id,
        role: p.role as 'proposer' | 'invitee' | 'observer',
        status: p.status as 'pending' | 'accepted' | 'rejected',
        name: agentMap.get(p.agent_id)?.display_name || agentMap.get(p.agent_id)?.name || null,
      })),
      lastMessage,
    });
  }

  return {
    ...contract,
    proposer: proposer || { id: contract.proposer_id, name: 'unknown', display_name: 'Unknown' },
    participants,
    attachments,
    linked_task: linkedTask,
    related_contracts: options.relatedContracts ?? (await getRelatedContracts(contract.id)),
    turn_state: turnState,
  };
}

/**
 * Verify that a given agent is a participant in a contract. Returns the participant row or null.
 */
export async function getParticipant(contractId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('contract_participants')
    .select('*')
    .eq('contract_id', contractId)
    .eq('agent_id', agentId)
    .single();

  return data;
}

/**
 * Check if all participants have accepted. If so, activate the contract.
 */
export async function activateIfAllAccepted(contractId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data: participants } = await supabase
    .from('contract_participants')
    .select('status')
    .eq('contract_id', contractId);

  if (!participants || participants.length === 0) return false;

  const allAccepted = participants.every((p) => p.status === 'accepted');

  if (allAccepted) {
    const { data: activated } = await supabase
      .from('contracts')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .eq('status', 'proposed')
      .select('id')
      .maybeSingle();

    return !!activated;
  }

  return false;
}
