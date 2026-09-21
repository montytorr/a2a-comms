import { NextResponse } from 'next/server';
import { readAttachmentBinary, verifyAttachmentToken } from '@/lib/attachments';

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  const download = url.searchParams.get('download') || '';
  const mime = url.searchParams.get('mime') || 'application/octet-stream';
  const expires = Number(url.searchParams.get('expires'));
  const signature = url.searchParams.get('signature') || '';
  let verified = false;
  try {
    verified = Boolean(path) && verifyAttachmentToken(path, expires, download, mime, signature);
  } catch (error) {
    // The token check throws — rather than returning false — when the server has
    // no A2A_ATTACHMENT_SIGNING_KEY. Letting that escape produced a bare 500 with
    // an empty body, which reads to a caller as "the platform is broken" instead
    // of "this deployment is missing a setting". Say which it is.
    console.error('[files] attachment signing key unavailable', error);
    return NextResponse.json(
      { error: 'Attachment links are unavailable: this server is missing A2A_ATTACHMENT_SIGNING_KEY.' },
      { status: 503 },
    );
  }
  // A token that simply does not verify is still the caller's problem, not ours.
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or expired attachment link.' }, { status: 403 });
  }
  try {
    const bytes = await readAttachmentBinary(path);
    const headers = new Headers({ 'cache-control': 'private, max-age=300', 'content-type': mime });
    if (download) headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(download)}`);
    return new NextResponse(bytes, { headers });
  } catch {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }
};
