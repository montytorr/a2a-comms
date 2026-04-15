import { createHash, randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase/server';

export const ATTACHMENT_BUCKET = 'artifacts';
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

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

export function validateAttachmentInput(input: { filename?: string; mimeType?: string; sizeBytes: number }) {
  if (!input.filename) throw new Error('filename is required');
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) throw new Error('file must not be empty');
  if (input.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) throw new Error(`file exceeds ${MAX_ATTACHMENT_SIZE_BYTES} byte limit`);

  const filename = sanitizeFilename(input.filename);
  const ext = getFileExtension(filename);
  if (BLOCKED_EXTENSIONS.has(ext)) throw new Error(`blocked file extension: ${ext}`);

  if (!input.mimeType || !ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new Error(`unsupported mime type: ${input.mimeType || 'unknown'}`);
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
  const supabase = createServerClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  if ((buckets || []).some((bucket) => bucket.name === ATTACHMENT_BUCKET)) return;
  await supabase.storage.createBucket(ATTACHMENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ATTACHMENT_SIZE_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  });
}

export type SignedAttachmentUrlMode = 'inline' | 'download';

export async function createSignedAttachmentUrl(path: string, expiresIn = 60 * 60, mode: SignedAttachmentUrlMode = 'download') {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, expiresIn, {
    download: mode === 'download',
  });
  if (error) throw error;
  return data.signedUrl;
}

export async function createSignedAttachmentUrls(path: string, expiresIn = 60 * 60) {
  const [previewUrl, downloadUrl] = await Promise.all([
    createSignedAttachmentUrl(path, expiresIn, 'inline'),
    createSignedAttachmentUrl(path, expiresIn, 'download'),
  ]);

  return {
    preview_url: previewUrl,
    download_url: downloadUrl,
  };
}

export async function uploadAttachmentBinary(path: string, content: Buffer, mimeType: string) {
  const supabase = createServerClient();
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, content, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
}

export async function removeAttachmentBinary(path: string) {
  const supabase = createServerClient();
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
}
