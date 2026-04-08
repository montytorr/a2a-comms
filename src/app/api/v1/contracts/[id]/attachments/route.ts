import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { ensureAttachmentBucket, uploadAttachmentBinary, validateAttachmentInput, buildAttachmentStoragePath, sha256Buffer, removeAttachmentBinary } from '@/lib/attachments';
import { listAttachmentsForScope } from '@/lib/attachment-access';
import { resolveProjectForContract } from '@/app/api/v1/projects/[id]/attachments/_helpers';
import type { ApiError } from '@/lib/types';
import { evaluateContractParticipantMutation } from '@/lib/contract-trust-policy';

async function verifyParticipation(contractId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('contract_participants')
    .select('id, role, status')
    .eq('contract_id', contractId)
    .eq('agent_id', agentId)
    .single();
  return data || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;
  const { auth } = result;
  const { id: contractId } = await params;

  const participation = await verifyParticipation(contractId, auth.agent.id);
  if (!participation) {
    return NextResponse.json({ error: 'Not a participant in this contract', code: 'FORBIDDEN' } satisfies ApiError, { status: 403 });
  }

  const projectId = await resolveProjectForContract(contractId);
  if (!projectId) {
    return NextResponse.json({ data: [] });
  }

  const attachments = await listAttachmentsForScope({ projectId, contractId, includeSignedUrl: true });
  return NextResponse.json({ data: attachments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;
  const { auth } = result;
  const { id: contractId } = await params;

  const participation = await verifyParticipation(contractId, auth.agent.id);
  if (!participation) {
    return NextResponse.json({ error: 'Not a participant in this contract', code: 'FORBIDDEN' } satisfies ApiError, { status: 403 });
  }

  const policy = evaluateContractParticipantMutation('upload-attachment', participation);
  if (!policy.allowed) {
    return NextResponse.json(policy.body satisfies ApiError, { status: policy.status });
  }

  const projectId = await resolveProjectForContract(contractId);
  if (!projectId) {
    return NextResponse.json({ error: 'Contract is not linked to a project task yet', code: 'VALIDATION_ERROR' } satisfies ApiError, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required', code: 'VALIDATION_ERROR' } satisfies ApiError, { status: 400 });
  }
  const note = typeof form.get('note') === 'string' ? (form.get('note') as string) : null;

  const content = Buffer.from(await file.arrayBuffer());
  const validated = validateAttachmentInput({ filename: file.name, mimeType: file.type, sizeBytes: content.length });
  const storagePath = buildAttachmentStoragePath({ projectId, contractId, filename: validated.filename });

  await ensureAttachmentBucket();
  await uploadAttachmentBinary(storagePath, content, validated.mimeType);

  const supabase = createServerClient();
  try {
    const { data: attachment, error } = await supabase
      .from('task_attachments')
      .insert({
        project_id: projectId,
        contract_id: contractId,
        uploader_agent_id: auth.agent.id,
        filename: validated.filename,
        original_name: file.name,
        mime_type: validated.mimeType,
        size_bytes: content.length,
        storage_bucket: 'artifacts',
        storage_path: storagePath,
        sha256: sha256Buffer(content),
        metadata: note ? { note } : {},
      })
      .select('*')
      .single();

    if (error || !attachment) throw error;

    await auditLog({
      actor: auth.agent.name,
      action: 'attachment.upload',
      resourceType: 'contract',
      resourceId: contractId,
      details: { project_id: projectId, attachment_id: attachment.id, filename: attachment.original_name, mime_type: attachment.mime_type, size_bytes: attachment.size_bytes },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    await removeAttachmentBinary(storagePath).catch(() => {});
    throw error;
  }
}
