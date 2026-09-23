'use server';

import { createServerClient } from '@/lib/db/server';
import { revalidatePath } from 'next/cache';
import { ensureAttachmentBucket, uploadAttachmentBinary, validateAttachmentInput, buildAttachmentStoragePath, sha256Buffer } from '@/lib/attachments';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { EMPTY_UUID } from '@/lib/dashboard-actor-helpers';
import { emitContractClosed, UNAPPROVED_CLOSE_REASON_MIN } from '@/lib/contract-closure';

export async function uploadContractAttachment(contractId: string, formData: FormData) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) throw new Error('Unauthorized');

  const db = createServerClient();
  const agentScope = auth.agentScope.length > 0 ? auth.agentScope : [EMPTY_UUID];
  const { data: participation } = await db
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

  const { data: link } = await db
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

  const { error } = await db.from('task_attachments').insert({
    project_id: task.project_id,
    contract_id: contractId,
    uploader_agent_id: participation?.[0]?.agent_id || auth.actingAgentId || null,
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

  await db.from('audit_log').insert({
    actor: user.email || user.displayName,
    action: 'attachment.upload',
    resource_type: 'contract',
    resource_id: contractId,
    details: {
      project_id: task.project_id,
      filename: file.name,
      mime_type: validated.mimeType,
      size_bytes: buffer.length,
      actor_agent_id: participation?.[0]?.agent_id || auth.actingAgentId || null,
    },
  });

  revalidatePath(`/contracts/${contractId}`);
}

export type CloseContractResult =
  | { ok: true }
  | { ok: false; error: string };

// Returned, never thrown: Next.js replaces a thrown server-action error with a
// generic "Server Components render" message in production builds, so the
// operator would never see why the close was refused.
export async function closeContract(
  contractId: string,
  options: { withoutApproval?: boolean; reason?: string } = {}
): Promise<CloseContractResult> {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) return { ok: false, error: 'You are signed out. Sign in again to close this contract.' };

  const db = createServerClient();

  if (!user.isSuperAdmin) {
    const { data: participation } = await db
      .from('contract_participants')
      .select('id, role, agent_id')
      .eq('contract_id', contractId)
      .in('agent_id', auth.agentScope.length > 0 ? auth.agentScope : [EMPTY_UUID])
      .limit(1);

    if (!participation || participation.length === 0) {
      return { ok: false, error: 'You are not a participant in this contract.' };
    }

    if (participation[0]?.role === 'observer') {
      return { ok: false, error: 'Observers may inspect a contract but cannot close it.' };
    }
  }

  const { data: contract } = await db
    .from('contracts')
    .select('status, current_turns, max_turns, completion_requires_approval, completion_approved_at, proposer:agents!contracts_proposer_id_fkey(name, display_name)')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract) return { ok: false, error: 'Contract not found.' };
  if (contract.status !== 'active') {
    return { ok: false, error: `This contract is ${contract.status}; only active contracts can be closed.` };
  }
  // An operator may close a stuck gated contract, but only as an explicit,
  // reasoned refusal of the work - never as a completion. Without that the
  // contract could sit active forever when its proposer never approved.
  const typedReason = options.reason?.trim() ?? '';
  let closedWithoutApproval = false;
  if (contract.completion_requires_approval && !contract.completion_approved_at) {
    const proposer = Array.isArray(contract.proposer) ? contract.proposer[0] : contract.proposer;
    const proposerName = proposer?.display_name || proposer?.name || 'the proposer';
    if (!options.withoutApproval) {
      return {
        ok: false,
        error: `This contract needs completion approval from ${proposerName} before it can close. ${proposerName} approves it with \`holloway approve-completion ${contractId}\`, or you can close it without approving and give a reason.`,
      };
    }
    if (typedReason.length < UNAPPROVED_CLOSE_REASON_MIN) {
      return {
        ok: false,
        error: `Say why the work is not being accepted, in at least ${UNAPPROVED_CLOSE_REASON_MIN} characters.`,
      };
    }
    closedWithoutApproval = true;
  }

  const actor = user.email || user.displayName;
  const reason = closedWithoutApproval
    ? `Closed without approval by operator: ${typedReason}`
    : 'Closed by operator via UI';

  let closeQuery = db
    .from('contracts')
    .update({
      status: 'closed',
      close_reason: reason,
      closed_by: actor,
      closed_by_kind: 'user',
      closed_without_approval: closedWithoutApproval,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .eq('status', 'active');
  // An approval landing mid-close would otherwise be recorded as a refusal.
  if (closedWithoutApproval) closeQuery = closeQuery.is('completion_approved_at', null);
  const { data: closed, error } = await closeQuery.select('id, status').maybeSingle();

  if (error) return { ok: false, error: `The contract could not be closed: ${error.message}` };
  if (!closed) return { ok: false, error: 'The contract changed while you were closing it. Reload to see its current state.' };

  emitContractClosed({
    contractId,
    status: 'closed',
    closedBy: actor,
    closedByKind: 'user',
    reason,
    currentTurns: contract.current_turns,
    maxTurns: contract.max_turns,
    completionApprovedAt: contract.completion_approved_at,
    closedWithoutApproval,
  }).catch(() => {});

  await db.from('audit_log').insert({
    actor,
    action: 'contract.close',
    resource_type: 'contract',
    resource_id: contractId,
    details: {
      reason,
      without_approval: closedWithoutApproval,
      actor_agent_id: auth.actingAgentId || null,
    },
  });

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath('/contracts');
  return { ok: true };
}
