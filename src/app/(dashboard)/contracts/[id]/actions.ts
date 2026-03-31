'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';

export async function closeContract(contractId: string) {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');

  // Check participation unless superAdmin
  if (!user.isSuperAdmin) {
    const supabase = createServerClient();
    const { data: participation } = await supabase
      .from('contract_participants')
      .select('id')
      .eq('contract_id', contractId)
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);

    if (!participation || participation.length === 0) {
      throw new Error('Forbidden: not a participant');
    }
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from('contracts')
    .update({
      status: 'closed',
      close_reason: 'Closed by operator via UI',
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to close contract: ${error.message}`);
  }

  const actor = user.email || user.displayName;

  // Log the action
  await supabase.from('audit_log').insert({
    actor,
    action: 'contract.close',
    resource_type: 'contract',
    resource_id: contractId,
    details: { reason: 'Closed by operator via UI' },
  });
}
