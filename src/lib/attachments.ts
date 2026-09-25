import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readEnv } from './env';

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const attachmentRoot = () => resolve(readEnv('ATTACHMENT_DIR') || '/data/attachments');
const signingKey = () => {
  const key = readEnv('ATTACHMENT_SIGNING_KEY');
  if (!key) throw new Error('HOLLOWAY_ATTACHMENT_SIGNING_KEY (or legacy A2A_ATTACHMENT_SIGNING_KEY) is required');
  return key;
};
const absolutePath = (storagePath: string) => {
  const root = attachmentRoot();
  const target = resolve(root, storagePath);
  if (target !== root && !target.startsWith(`${root}/`)) throw new Error('Invalid attachment path');
  return target;
};

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.scr', '.js', '.mjs', '.cjs', '.jar', '.ps1', '.php', '.py'
]);

export interface AttachmentRecord {
  id: string;
  project_id: string;
  task_id: string | null;
  contract_id: string | null;
  run_id: string | null;
  checkpoint_id: string | null;
  uploader_agent_id: string | null;
  uploader_user_id: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  sha256: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function sanitizeFilename(name: string): string {
  const trimmed = (name || 'attachment').trim();
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return cleaned.slice(0, 180) || 'attachment';
}

export function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

/**
 * Every throw below is the caller getting it wrong, not the server falling over.
 * It carries its own type so a route can map it to 400 instead of letting it
 * escape as a 500 — which is what happened on 2026-09-21, when an agent read an
 * opaque 500 as "the platform is broken" and stopped delivering.
 */
export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentValidationError';
  }
}

export function validateAttachmentInput(input: { filename?: string; mimeType?: string; sizeBytes: number }) {
  if (!input.filename) throw new AttachmentValidationError('filename is required');
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) throw new AttachmentValidationError('file must not be empty');
  if (input.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) throw new AttachmentValidationError(`file exceeds ${MAX_ATTACHMENT_SIZE_BYTES} byte limit`);

  const filename = sanitizeFilename(input.filename);
  const ext = getFileExtension(filename);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new AttachmentValidationError(
      `blocked file extension: ${ext}. Executable and script files cannot be attached; put it in an archive instead.`
    );
  }

  if (!input.mimeType || !ALLOWED_MIME_TYPES.has(input.mimeType)) {
    // Naming the accepted set is the whole point: a rejection an agent cannot
    // act on costs it a turn asking what to send instead.
    throw new AttachmentValidationError(
      `unsupported mime type: ${input.mimeType || 'unknown'}. Accepted types: ${[...ALLOWED_MIME_TYPES].sort().join(', ')}`
    );
  }

  return { filename, mimeType: input.mimeType };
}

export function buildAttachmentStoragePath(params: {
  projectId: string;
  taskId?: string | null;
  contractId?: string | null;
  filename: string;
}) {
  const scope = params.taskId ? `tasks/${params.taskId}` : `contracts/${params.contractId}`;
  return `${params.projectId}/${scope}/${randomUUID()}-${sanitizeFilename(params.filename)}`;
}

export function sha256Buffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function ensureAttachmentBucket() {
  await mkdir(attachmentRoot(), { recursive: true });
}

export type SignedAttachmentUrlMode = 'inline' | 'download';

export async function createSignedAttachmentUrl(path: string, expiresIn = 60 * 60, mode: SignedAttachmentUrlMode = 'download', originalName = '', mimeType = 'application/octet-stream') {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const download = mode === 'download' ? originalName : '';
  const value = `${path}\n${expires}\n${download}\n${mimeType}`;
  const signature = createHmac('sha256', signingKey()).update(value).digest('base64url');
  const query = new URLSearchParams({ path, expires: String(expires), mime: mimeType, signature });
  if (download) query.set('download', download);
  return `/api/files?${query}`;
}

export async function createSignedAttachmentUrls(path: string, expiresIn = 60 * 60, originalName = '', mimeType = 'application/octet-stream') {
  const [previewUrl, downloadUrl] = await Promise.all([
    createSignedAttachmentUrl(path, expiresIn, 'inline', originalName, mimeType),
    createSignedAttachmentUrl(path, expiresIn, 'download', originalName, mimeType),
  ]);

  return {
    preview_url: previewUrl,
    download_url: downloadUrl,
  };
}

export async function uploadAttachmentBinary(path: string, content: Buffer, mimeType: string) {
  void mimeType;
  const target = absolutePath(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: 'wx', mode: 0o600 });
}

export async function removeAttachmentBinary(path: string) {
  await unlink(absolutePath(path)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export function verifyAttachmentToken(path: string, expires: number, download: string, mimeType: string, signature: string) {
  if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', signingKey()).update(`${path}\n${expires}\n${download}\n${mimeType}`).digest();
  const supplied = Buffer.from(signature, 'base64url');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const readAttachmentBinary = (path: string) => readFile(absolutePath(path));
