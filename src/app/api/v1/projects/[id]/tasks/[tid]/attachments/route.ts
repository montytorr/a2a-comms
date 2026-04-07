import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { ensureAttachmentBucket, uploadAttachmentBinary, validateAttachmentInput, buildAttachmentStoragePath, sha256Buffer, removeAttachmentBinary } from '@/lib/attachments';
import { listAttachmentsForScope } from '@/lib/attachment-access';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ApiError } from '@/lib/types';

function isMissingAttachmentIdsColumn(error: PostgrestError | null | undefined) {
  return !!error && /attachment_ids/i.test(error.message || '');
}

async function verifyTask(projectId: string, taskId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('tasks')
    .select('id, project_id')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .single();
  return data || null;
}

async function verifyMembership(projectId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();
  return data || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;
  const { auth } = result;
  const { id: projectId, tid: taskId } = await params;

  const member = await verifyMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json({ error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError, { status: 403 });
  }

  const task = await verifyTask(projectId, taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError, { status: 404 });
  }

  const attachments = await listAttachmentsForScope({ projectId, taskId, includeSignedUrl: true });
  return NextResponse.json({ data: attachments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;
  const { auth } = result;
  const { id: projectId, tid: taskId } = await params;

  const member = await verifyMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json({ error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError, { status: 403 });
  }

  const task = await verifyTask(projectId, taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required', code: 'VALIDATION_ERROR' } satisfies ApiError, { status: 400 });
  }

  const checkpointId = typeof form.get('checkpoint_id') === 'string' ? (form.get('checkpoint_id') as string) : null;
  const runId = typeof form.get('run_id') === 'string' ? (form.get('run_id') as string) : null;
  const note = typeof form.get('note') === 'string' ? (form.get('note') as string) : null;

  const content = Buffer.from(await file.arrayBuffer());
  const validated = validateAttachmentInput({ filename: file.name, mimeType: file.type, sizeBytes: content.length });
  const storagePath = buildAttachmentStoragePath({ projectId, taskId, filename: validated.filename });

  await ensureAttachmentBucket();
  await uploadAttachmentBinary(storagePath, content, validated.mimeType);

  const supabase = createServerClient();
  try {
    const { data: attachment, error } = await supabase
      .from('task_attachments')
      .insert({
        project_id: projectId,
        task_id: taskId,
        run_id: runId,
        checkpoint_id: checkpointId,
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

    if (checkpointId) {
      const checkpointResult = await supabase
        .from('task_execution_checkpoints')
        .select('attachment_ids')
        .eq('id', checkpointId)
        .single();

      if (!isMissingAttachmentIdsColumn(checkpointResult.error)) {
        const attachmentIds = Array.isArray(checkpointResult.data?.attachment_ids) ? checkpointResult.data.attachment_ids : [];
        const updateResult = await supabase
          .from('task_execution_checkpoints')
          .update({ attachment_ids: [...attachmentIds, attachment.id] })
          .eq('id', checkpointId);
        if (updateResult.error) throw updateResult.error;
      }
    }

    await auditLog({
      actor: auth.agent.name,
      action: 'attachment.upload',
      resourceType: 'task',
      resourceId: taskId,
      details: { project_id: projectId, attachment_id: attachment.id, filename: attachment.original_name, mime_type: attachment.mime_type, size_bytes: attachment.size_bytes },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    await removeAttachmentBinary(storagePath).catch(() => {});
    throw error;
  }
}
