'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import { ensureAttachmentBucket, uploadAttachmentBinary, validateAttachmentInput, buildAttachmentStoragePath, sha256Buffer } from '@/lib/attachments';

export async function uploadContractAttachment(contractId: string, formData: FormData) {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');

  const supabase = createServerClient();
  const agentScope = user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'];
  const { data: participation } = await supabase
    .from('contract_participants')
    .select('id, agent_id, role, status')
    .eq('contract_id', contractId)
    .in('agent_id', agentScope)
    .limit(1);
  if (!user.isSuperAdmin && (!participation || participation.length === 0)) {
    throw new Error('Forbidden: not a participant');
  }

  if (!user.isSuperAdmin && participation?.[0]?.role === 'observer') {
    throw new Error('Forbidden: observers may inspect contract artifacts but cannot upload new ones');
  }

  const { data: link } = await supabase
    .from('task_contracts')
    .select('task:tasks!task_contracts_task_id_fkey(project_id)')
    .eq('contract_id', contractId)
    .limit(1)
    .maybeSingle();
  const task = Array.isArray(link?.task) ? link?.task[0] : link?.task;
  if (!task?.project_id) throw new Error('Contract must be linked to a project task before attachments are allowed');

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('File is required');
  const note = typeof formData.get('note') === 'string' ? formData.get('note') as string : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const validated = validateAttachmentInput({ filename: file.name, mimeType: file.type, sizeBytes: buffer.length });
  const storagePath = buildAttachmentStoragePath({ projectId: task.project_id, contractId, filename: validated.filename });

  await ensureAttachmentBucket();
  await uploadAttachmentBinary(storagePath, buffer, validated.mimeType);

  const { error } = await supabase.from('task_attachments').insert({
    project_id: task.project_id,
    contract_id: contractId,
    uploader_agent_id: participation?.[0]?.agent_id || user.agentIds[0] || null,
    uploader_user_id: user.id,
    filename: validated.filename,
    original_name: file.name,
    mime_type: validated.mimeType,
    size_bytes: buffer.length,
    storage_bucket: 'artifacts',
    storage_path: storagePath,
    sha256: sha256Buffer(buffer),
    metadata: note ? { note } : {},
  });
  if (error) throw new Error(`Failed to save attachment: ${error.message}`);

  await supabase.from('audit_log').insert({
    actor: user.email || user.displayName,
    action: 'attachment.upload',
    resource_type: 'contract',
    resource_id: contractId,
    details: { project_id: task.project_id, filename: file.name, mime_type: validated.mimeType, size_bytes: buffer.length },
  });

  revalidatePath(`/contracts/${contractId}`);
}

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
