'use server';

import { createServerClient } from '@/lib/supabase/server';

export async function closeContract(contractId: string) {
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

  // Log the action
  await supabase.from('audit_log').insert({
    actor: 'operator',
    action: 'contract.close',
    resource_type: 'contract',
    resource_id: contractId,
    details: { reason: 'Closed by operator via UI' },
  });
}
