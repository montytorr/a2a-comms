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

export default function AttachmentListClient({ attachments }: { attachments: TaskAttachment[]; fallback?: ReactNode }) {
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const sorted = useMemo(() => [...attachments].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [attachments]);

  if (!sorted.length) {
    return null;
  }

  return (
    <>
      <div className="space-y-3">
        {sorted.map((attachment) => {
          const isImage = isImageAttachment(attachment);
          const isText = isTextAttachment(attachment);
          const isPreviewable = isPreviewableDocument(attachment);
          const href = attachment.download_url;

          return (
            <div key={attachment.id} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              {isImage && href ? (
                <button
                  type="button"
                  onClick={() => setPreview(attachment)}
                  className="group block w-full border-b border-white/[0.06] bg-[#0b0b12] text-left"
                >
                  <div className="relative h-40 w-full overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={href}
                      alt={attachment.original_name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur">
                      Open image
                    </div>
                  </div>
                </button>
              ) : null}

              <div className="px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                      {typeLabel(attachment)}
                    </span>
                    <p className="text-[12px] font-medium text-gray-200 break-all">{attachment.original_name}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {attachment.mime_type} · {humanSize(attachment.size_bytes)} · {formatDateTime(attachment.created_at)}
                  </p>
                  {typeof attachment.metadata?.note === 'string' && attachment.metadata.note.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-2 whitespace-pre-wrap">{attachment.metadata.note}</p>
                  )}
                  {typeof attachment.metadata?.observer_note === 'string' && attachment.metadata.observer_note.length > 0 && (
                    <p className="text-[11px] text-cyan-300/80 mt-2">Observer note: {attachment.metadata.observer_note}</p>
                  )}
                  {isPreviewable ? (
                    <div className="mt-3 rounded-2xl border border-cyan-400/15 bg-gradient-to-r from-cyan-500/[0.08] via-sky-500/[0.04] to-transparent px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Preview available</p>
                      <p className="mt-1 text-[11px] text-gray-300">
                        {isImage
                          ? 'Use the preview button below to open this image in the inline viewer, or open it in a new tab.'
                          : `Open this ${attachment.mime_type === 'application/pdf' ? 'PDF' : 'document'} in a new tab to preview it.`}
                      </p>
                    </div>
                  ) : !isImage && isText ? (
                    <p className="mt-2 text-[11px] text-gray-500">Best for notes, markdown, logs, and structured text artifacts.</p>
                  ) : null}
                </div>

                {href ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setPreview(attachment)}
                        className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200 hover:bg-cyan-400/20"
                      >
                        Preview image
                      </button>
                    ) : isPreviewable ? (
                      <Link
                        href={href}
                        target="_blank"
                        className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200 hover:bg-cyan-400/20"
                      >
                        Preview / Open
                      </Link>
                    ) : null}
                    <Link
                      href={href}
                      target="_blank"
                      className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-200 hover:bg-white/[0.08]"
                    >
                      {isPreviewable ? 'Open in new tab' : 'Download'}
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
            className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/[0.08] bg-[#090910] shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-100">{preview.original_name}</p>
                <p className="text-[10px] text-gray-500">{preview.mime_type} · {humanSize(preview.size_bytes)}</p>
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
