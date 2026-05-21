import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { getAttachmentById, getProjectMembership, verifyContractParticipation } from '@/lib/attachment-access';
import { createSignedAttachmentUrl } from '@/lib/attachments';
import { evaluateAttachmentDownloadAccess } from '@/lib/attachment-trust-policy';
import type { ApiError } from '@/lib/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ aid: string }> }) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;
  const { auth } = result;
  const { aid } = await params;

  let attachment;
  try {
    attachment = await getAttachmentById(aid);
  } catch {
    return NextResponse.json({ error: 'Failed to look up attachment', code: 'INTERNAL_ERROR' } satisfies ApiError, { status: 500 });
  }
  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found', code: 'NOT_FOUND' } satisfies ApiError, { status: 404 });
  }

  const projectAccess = attachment.task_id
    ? await getProjectMembership(attachment.project_id, auth.agent.id)
    : null;

  const projectPolicy = evaluateAttachmentDownloadAccess(auth.agent, projectAccess, {
    contract_id: attachment.contract_id,
  });

  let allowed = projectPolicy.allowed;
  if (!allowed && attachment.contract_id) {
    const participation = await verifyContractParticipation(attachment.contract_id, auth.agent.id);
    if (participation) {
      const contractAttachmentPolicy = evaluateAttachmentDownloadAccess(auth.agent, projectAccess, {
        contract_id: attachment.contract_id,
      });
      allowed = contractAttachmentPolicy.allowed || (projectAccess?.accessKind !== 'observer');
    }
  }

  if (!allowed) {
    return NextResponse.json(projectPolicy.body || ({ error: 'Forbidden', code: 'FORBIDDEN' } satisfies ApiError), { status: projectPolicy.status || 403 });
  }

  const url = await createSignedAttachmentUrl(attachment.storage_path, 60 * 60, 'download');
  return NextResponse.json({ id: attachment.id, download_url: url, filename: attachment.original_name });
}
