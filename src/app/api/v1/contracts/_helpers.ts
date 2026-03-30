import { createServerClient } from '@/lib/supabase/server';
import type { Contract, ContractResponse } from '@/lib/types';

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
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id)
      .select()
      .single();

    return (updated as Contract) || { ...contract, status: newStatus, close_reason: closeReason };
  }

  return contract;
}

/**
 * Enrich a contract row with proposer and participants info for API response.
 */
export async function enrichContract(contract: Contract): Promise<ContractResponse> {
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
    role: p.role as 'proposer' | 'invitee',
    status: p.status as 'pending' | 'accepted' | 'rejected',
  }));

  return {
    ...contract,
    proposer: proposer || { id: contract.proposer_id, name: 'unknown', display_name: 'Unknown' },
    participants,
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
    await supabase
      .from('contracts')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .eq('status', 'proposed');

    return true;
  }

  return false;
}
