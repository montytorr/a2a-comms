import { createServerClient } from '@/lib/supabase/server';
import { createSignedAttachmentUrls } from '@/lib/attachments';
import type { AttachmentRecord } from '@/lib/attachments';
import { getProjectAccess } from '@/lib/project-access';

export async function getProjectMembership(projectId: string, agentId: string) {
  return getProjectAccess(projectId, agentId);
}

export async function verifyContractParticipation(contractId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('contract_participants')
    .select('id, role, status')
    .eq('contract_id', contractId)
    .eq('agent_id', agentId)
    .single();
  return data || null;
}

export async function listAttachmentsForScope(input: { projectId: string; taskId?: string; contractId?: string; includeSignedUrl?: boolean }) {
  const supabase = createServerClient();
  let query = supabase
    .from('task_attachments')
    .select('*')
    .eq('project_id', input.projectId)
    .order('created_at', { ascending: false });

  if (input.taskId) query = query.eq('task_id', input.taskId);
  if (input.contractId) query = query.eq('contract_id', input.contractId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as AttachmentRecord[];
  if (!input.includeSignedUrl) return rows;

  return Promise.all(rows.map(async (row) => ({ ...row, ...(await createSignedAttachmentUrls(row.storage_path)) })));
}

export async function getAttachmentById(id: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as AttachmentRecord;
}
