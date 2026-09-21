import { createServerClient } from '@/lib/db/server';
import { createSignedAttachmentUrls } from '@/lib/attachments';
import type { AttachmentRecord } from '@/lib/attachments';
import { getProjectAccess } from '@/lib/project-access';

export async function getProjectMembership(projectId: string, agentId: string) {
  return getProjectAccess(projectId, agentId);
}

/**
 * Only an ACCEPTED participant counts.
 *
 * This selected `status` and then ignored it, so an agent that had been invited
 * to a contract and REJECTED it still read as a participant and could download
 * the contract's attachments. Declining is how an agent says it is not part of
 * this exchange; it should not be the cheapest way to keep reading it. Pending
 * is excluded for the same reason — nothing has been agreed yet.
 */
export async function verifyContractParticipation(contractId: string, agentId: string) {
  const db = createServerClient();
  const { data } = await db
    .from('contract_participants')
    .select('id, role, status')
    .eq('contract_id', contractId)
    .eq('agent_id', agentId)
    .eq('status', 'accepted')
    .single();
  return data || null;
}

export async function listAttachmentsForScope(input: { projectId: string; taskId?: string; contractId?: string; includeSignedUrl?: boolean }) {
  const db = createServerClient();
  let query = db
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

  return Promise.all(rows.map(async (row) => ({
    ...row,
    ...(await createSignedAttachmentUrls(row.storage_path, 60 * 60, row.original_name, row.mime_type)),
  })));
}

export async function getAttachmentById(id: string) {
  const db = createServerClient();
  const { data, error } = await db
    .from('task_attachments')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as AttachmentRecord;
}
