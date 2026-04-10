'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { TaskAttachment } from '@/lib/types';
import { formatDateTime } from '@/lib/format-date';

function humanSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string) {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

function isImageAttachment(attachment: TaskAttachment) {
  return attachment.mime_type.startsWith('image/');
}

function isTextAttachment(attachment: TaskAttachment) {
  const ext = extensionOf(attachment.original_name || attachment.filename || '');
  return attachment.mime_type.startsWith('text/') || ['md', 'markdown', 'txt', 'json', 'log', 'yaml', 'yml', 'csv'].includes(ext);
}

function isPreviewableDocument(attachment: TaskAttachment) {
  const ext = extensionOf(attachment.original_name || attachment.filename || '');
  return isTextAttachment(attachment)
    || attachment.mime_type === 'application/pdf'
    || ['pdf', 'md', 'markdown', 'txt', 'json', 'log', 'yaml', 'yml', 'csv'].includes(ext);
}

function typeLabel(attachment: TaskAttachment) {
  if (isImageAttachment(attachment)) return 'Image';
  if (attachment.mime_type === 'application/pdf') return 'PDF';
  if (isTextAttachment(attachment)) return 'Text';
  return 'File';
}

function actionLabel(attachment: TaskAttachment) {
  if (isImageAttachment(attachment)) return 'Preview';
  if (isPreviewableDocument(attachment)) return 'Open';
  return 'Download';
}

export default function AttachmentListClient({ attachments }: { attachments: TaskAttachment[]; fallback?: ReactNode }) {
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const sorted = useMemo(() => [...attachments].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [attachments]);

  if (!sorted.length) {
    return null;
  }

  return (
    <>
      <div className="space-y-2.5">
        {sorted.map((attachment) => {
          const isImage = isImageAttachment(attachment);
          const href = attachment.download_url;
          const note = typeof attachment.metadata?.note === 'string' && attachment.metadata.note.length > 0 ? attachment.metadata.note : null;
          const observerNote = typeof attachment.metadata?.observer_note === 'string' && attachment.metadata.observer_note.length > 0 ? attachment.metadata.observer_note : null;

          return (
            <div
              key={attachment.id}
              className="overflow-hidden rounded-2xl border border-white/[0.05] bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.018))] shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
            >
              <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  {isImage && href ? (
                    <button
                      type="button"
                      onClick={() => setPreview(attachment)}
                      className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#090910] text-left sm:h-[72px] sm:w-[72px]"
                      aria-label={`Preview ${attachment.original_name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={href}
                        alt={attachment.original_name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                    </button>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:h-[72px] sm:w-[72px]">
                      {typeLabel(attachment)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-300">
                        {typeLabel(attachment)}
                      </span>
                      <p className="min-w-0 break-all text-[12px] font-medium text-gray-100">{attachment.original_name}</p>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                      {humanSize(attachment.size_bytes)} <span className="text-gray-600">•</span> {formatDateTime(attachment.created_at)}
                    </p>
                    {note ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-gray-400 whitespace-pre-wrap">{note}</p>
                    ) : null}
                    {observerNote ? (
                      <p className="mt-2 text-[10px] text-cyan-300/75">Observer note: {observerNote}</p>
                    ) : null}
                  </div>
                </div>

                {href ? (
                  <div className="flex shrink-0 items-center gap-2 self-start sm:ml-4">
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setPreview(attachment)}
                        className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200 hover:bg-cyan-400/[0.14]"
                      >
                        {actionLabel(attachment)}
                      </button>
                    ) : (
                      <Link
                        href={href}
                        target="_blank"
                        className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200 hover:bg-cyan-400/[0.14]"
                      >
                        {actionLabel(attachment)}
                      </Link>
                    )}
                    <Link
                      href={href}
                      target="_blank"
                      className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-200 hover:bg-white/[0.08]"
                    >
                      Open in new tab
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {preview && preview.download_url ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div
            className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#090910] shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-100">{preview.original_name}</p>
                <p className="text-[10px] text-gray-500">{humanSize(preview.size_bytes)} <span className="text-gray-600">•</span> {formatDateTime(preview.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={preview.download_url}
                  target="_blank"
                  className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 hover:bg-cyan-500/[0.14]"
                >
                  Open in new tab
                </Link>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]"
                  aria-label="Close image preview"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-[#05050a]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.download_url} alt={preview.original_name} className="mx-auto h-auto max-h-[80vh] w-auto max-w-full" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
