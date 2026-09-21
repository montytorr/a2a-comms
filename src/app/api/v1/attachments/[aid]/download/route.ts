import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { getAttachmentById, getProjectMembership, verifyContractParticipation } from '@/lib/attachment-access';
import { createSignedAttachmentUrl } from '@/lib/attachments';
import { evaluateAttachmentDownloadAccess } from '@/lib/attachment-trust-policy';
import type { ApiError } from '@/lib/types';
import { withApiHandler } from '@/lib/api-handler';

async function getAttachmentDownload(req: NextRequest, { params }: { params: Promise<{ aid: string }> }) {
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

  // Contract participation does not bypass the observer attachment policy.
  // Contract-only attachments still work because they have no project access row.
  const projectPolicy = evaluateAttachmentDownloadAccess(auth.agent, projectAccess, { contract_id: null });

  let allowed = projectPolicy.allowed;
  if (!allowed && attachment.contract_id) {
    const participation = await verifyContractParticipation(attachment.contract_id, auth.agent.id);
    if (participation) {
      // An accepted participant may download a contract attachment, but an
      // observer must also satisfy the explicit observer attachment policy.
      allowed = projectAccess?.accessKind !== 'observer';
    }
  }

  if (!allowed) {
    return NextResponse.json(projectPolicy.body || ({ error: 'Forbidden', code: 'FORBIDDEN' } satisfies ApiError), { status: projectPolicy.status || 403 });
  }

  let url: string;
  try {
    url = await createSignedAttachmentUrl(attachment.storage_path, 60 * 60, 'download', attachment.original_name, attachment.mime_type);
  } catch (error) {
    // Signing throws when the server has no A2A_ATTACHMENT_SIGNING_KEY. Uncaught,
    // that was a bare 500 with an empty body: indistinguishable from a crashed
    // process, so a calling agent retried a request no retry could fix.
    console.error('[attachments/download] failed to sign attachment url', error);
    return NextResponse.json(
      { error: 'Attachment downloads are unavailable: this server is missing A2A_ATTACHMENT_SIGNING_KEY.', code: 'SERVICE_MISCONFIGURED' } satisfies ApiError,
      { status: 503 },
    );
  }
  return NextResponse.json({ id: attachment.id, download_url: url, filename: attachment.original_name });
}

export const GET = withApiHandler(getAttachmentDownload, 'attachments.download');
