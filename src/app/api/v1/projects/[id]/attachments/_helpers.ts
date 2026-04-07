import { createServerClient } from '@/lib/supabase/server';

export async function resolveProjectForContract(contractId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('task_contracts')
    .select('task:tasks!task_contracts_task_id_fkey(project_id)')
    .eq('contract_id', contractId)
    .limit(1)
    .maybeSingle();

  const task = Array.isArray(data?.task) ? data?.task[0] : data?.task;
  return task?.project_id || null;
}
