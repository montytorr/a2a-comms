import { NextResponse } from 'next/server';
import { readAttachmentBinary, verifyAttachmentToken } from '@/lib/attachments';

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  const download = url.searchParams.get('download') || '';
  const mime = url.searchParams.get('mime') || 'application/octet-stream';
  const expires = Number(url.searchParams.get('expires'));
  const signature = url.searchParams.get('signature') || '';
  if (!path || !verifyAttachmentToken(path, expires, download, mime, signature)) {
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
