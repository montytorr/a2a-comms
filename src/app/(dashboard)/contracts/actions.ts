'use server';

import { revalidatePath } from 'next/cache';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { createServerClient } from '@/lib/supabase/server';
import { createContractProposal, ContractProposalError } from '@/lib/contract-proposals';
import type { ProposeContractRequest } from '@/lib/types';

function parseJsonField(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return JSON.parse(value);
}

function parseIntegerField(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function proposeContractFromDashboard(formData: FormData) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) throw new Error('Unauthorized');

  const proposerAgentId = typeof formData.get('proposer_agent_id') === 'string' ? formData.get('proposer_agent_id') as string : '';
  if (!proposerAgentId) throw new Error('Choose a proposer agent');
  if (!user.isSuperAdmin && !auth.agentScope.includes(proposerAgentId)) throw new Error('Forbidden');

  const supabase = createServerClient();
  const { data: actor } = await supabase
    .from('agents')
    .select('id, name, display_name, owner_user_id, trust_tier, max_concurrent_contracts')
    .eq('id', proposerAgentId)
    .single();

  if (!actor) throw new Error('Proposer agent not found');

  const request: ProposeContractRequest = {
    title: typeof formData.get('title') === 'string' ? (formData.get('title') as string).trim() : '',
    description: typeof formData.get('description') === 'string' ? ((formData.get('description') as string).trim() || undefined) : undefined,
    invitees: parseJsonField(formData.get('invitees')) || [],
    observers: parseJsonField(formData.get('observers')) || [],
    max_turns: parseIntegerField(formData.get('max_turns')),
    expires_in_hours: parseIntegerField(formData.get('expires_in_hours')),
    message_schema: parseJsonField(formData.get('message_schema')) || undefined,
  };

  try {
    await createContractProposal({
      actor,
      request,
      auditActor: user.email || user.displayName || actor.name,
    });
  } catch (error) {
    if (error instanceof ContractProposalError) {
      throw new Error(error.body.error);
    }
    throw error;
  }

  revalidatePath('/contracts');
}
