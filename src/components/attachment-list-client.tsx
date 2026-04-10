'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

function isPdfAttachment(attachment: TaskAttachment) {
  return attachment.mime_type === 'application/pdf' || extensionOf(attachment.original_name || attachment.filename || '') === 'pdf';
}

function isVideoAttachment(attachment: TaskAttachment) {
  return attachment.mime_type.startsWith('video/');
}

function isAudioAttachment(attachment: TaskAttachment) {
  return attachment.mime_type.startsWith('audio/');
}

function isPreviewableDocument(attachment: TaskAttachment) {
  return isTextAttachment(attachment) || isPdfAttachment(attachment) || isVideoAttachment(attachment) || isAudioAttachment(attachment);
}

function typeLabel(attachment: TaskAttachment) {
  if (isImageAttachment(attachment)) return 'Image';
  if (isPdfAttachment(attachment)) return 'PDF';
  if (isVideoAttachment(attachment)) return 'Video';
  if (isAudioAttachment(attachment)) return 'Audio';
  if (isTextAttachment(attachment)) return 'Text';
  return 'File';
}

function actionLabel(attachment: TaskAttachment) {
  if (isImageAttachment(attachment)) return 'Preview';
  if (isPreviewableDocument(attachment)) return 'Open';
  return 'Download';
}

function fileKindLabel(attachment: TaskAttachment) {
  if (isImageAttachment(attachment)) return 'image';
  if (isPdfAttachment(attachment)) return 'PDF';
  if (isVideoAttachment(attachment)) return 'video';
  if (isAudioAttachment(attachment)) return 'audio';
  if (isTextAttachment(attachment)) return 'text';
  return 'file';
}

function InlinePreview({ attachment }: { attachment: TaskAttachment }) {
  const href = attachment.download_url;
  const [textContent, setTextContent] = useState<string>('');
  const [textError, setTextError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!href || !isTextAttachment(attachment)) {
      setTextContent('');
      setTextError(null);
      setLoadingText(false);
      return;
    }

    setLoadingText(true);
    setTextError(null);
    fetch(href)
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load preview');
        const text = await res.text();
        if (cancelled) return;
        const normalized = text.replace(/\r\n/g, '\n');
        setTextContent(normalized.length > 8000 ? `${normalized.slice(0, 8000)}\n\n… Preview truncated` : normalized);
      })
      .catch((err) => {
        if (cancelled) return;
        setTextError(err instanceof Error ? err.message : 'Unable to load preview');
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, href]);

  if (!href) {
    return <p className="text-sm text-gray-400">Preview unavailable for this file.</p>;
  }

  if (isImageAttachment(attachment)) {
    return (
      <div className="relative flex h-full w-full items-center justify-center rounded-[24px] border border-white/[0.08] bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-4 lg:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={attachment.original_name}
          className="h-auto max-h-[72vh] w-auto max-w-full rounded-[18px] object-contain shadow-[0_28px_70px_rgba(0,0,0,0.45)]"
        />
      </div>
    );
  }

  if (isPdfAttachment(attachment)) {
    return (
      <iframe
        src={href}
        title={attachment.original_name}
        className="h-[72vh] w-full rounded-[24px] border border-white/[0.08] bg-white"
      />
    );
  }

  if (isVideoAttachment(attachment)) {
    return (
      <video
        src={href}
        controls
        className="max-h-[72vh] w-full rounded-[24px] border border-white/[0.08] bg-black shadow-[0_28px_70px_rgba(0,0,0,0.45)]"
      />
    );
  }

  if (isAudioAttachment(attachment)) {
    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center rounded-[24px] border border-white/[0.08] bg-black/25 p-6">
        <audio src={href} controls className="w-full max-w-2xl" />
      </div>
    );
  }

  if (isTextAttachment(attachment)) {
    if (loadingText) return <p className="text-sm text-gray-400">Loading text preview…</p>;
    if (textError) return <p className="text-sm text-red-200">{textError}</p>;
    return (
      <pre className="h-[72vh] w-full overflow-auto rounded-[24px] border border-white/[0.08] bg-[#05070d] p-5 text-[12px] leading-6 text-gray-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] whitespace-pre-wrap break-words">
        {textContent || 'File is empty.'}
      </pre>
    );
  }

  return (
    <div className="flex h-full min-h-[240px] w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-white/[0.12] bg-black/20 p-8 text-center">
      <p className="text-sm font-medium text-gray-100">No inline preview for this file type yet.</p>
      <p className="mt-2 text-sm text-gray-400">Open it in a new tab or download it to inspect locally.</p>
    </div>
  );
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
          const canPreviewInline = !!href && (isImage || isPreviewableDocument(attachment));

          return (
            <div
              key={attachment.id}
              className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0b0b12] shadow-[0_12px_34px_rgba(0,0,0,0.22)]"
            >
              <div className="grid gap-3.5 p-4 md:grid-cols-[auto,minmax(0,1fr),auto] md:items-start md:gap-4">
                {isImage && href ? (
                  <button
                    type="button"
                    onClick={() => setPreview(attachment)}
                    className="group relative h-16 w-16 overflow-hidden rounded-xl border border-white/[0.07] bg-[#090910] text-left md:h-[72px] md:w-[72px]"
                    aria-label={`Preview ${attachment.original_name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={href}
                      alt={attachment.original_name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                  </button>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 md:h-[72px] md:w-[72px]">
                    {typeLabel(attachment)}
                  </div>
                )}

                <div className="min-w-0 space-y-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium leading-5 text-gray-100 break-words md:text-[15px]">{attachment.original_name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                      <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-300">
                        {typeLabel(attachment)}
                      </span>
                      <span>{humanSize(attachment.size_bytes)}</span>
                      <span className="text-gray-600">•</span>
                      <span>{formatDateTime(attachment.created_at)}</span>
                    </div>
                  </div>

                  {note ? (
                    <p className="text-[12px] leading-relaxed text-gray-400 whitespace-pre-wrap">{note}</p>
                  ) : null}
                  {observerNote ? (
                    <p className="text-[11px] text-cyan-300/75">Observer note: {observerNote}</p>
                  ) : null}
                </div>

                {href ? (
                  <div className="flex flex-wrap items-center gap-2 md:w-[172px] md:flex-col md:items-stretch">
                    {canPreviewInline ? (
                      <button
                        type="button"
                        onClick={() => setPreview(attachment)}
                        className="inline-flex items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/[0.08] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200 hover:bg-cyan-400/[0.14]"
                      >
                        {actionLabel(attachment)} {fileKindLabel(attachment)}
                      </button>
                    ) : null}
                    <Link
                      href={href}
                      target="_blank"
                      className="inline-flex items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-200 hover:bg-white/[0.08]"
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
        <div className="fixed inset-0 z-[80] bg-black/90 p-3 backdrop-blur-md sm:p-5" onClick={() => setPreview(null)}>
          <div
            className="mx-auto grid h-full max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#07070c] shadow-[0_32px_90px_rgba(0,0,0,0.62)] lg:grid-cols-[minmax(0,1fr),320px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden border-b border-white/[0.06] bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_34%),linear-gradient(180deg,_rgba(11,15,24,0.96),_rgba(5,5,10,1))] p-4 sm:p-6 lg:min-h-0 lg:border-b-0 lg:border-r lg:border-white/[0.06] lg:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06)_0%,transparent_24%,transparent_76%,rgba(255,255,255,0.04)_100%)]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
              <div className="relative h-full max-h-full w-full">
                <InlinePreview attachment={preview} />
              </div>
            </div>

            <aside className="flex min-h-0 flex-col bg-[#0b0c12]">
              <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/85">Attachment preview</p>
                    <p className="mt-2 text-base font-semibold leading-6 text-white break-words">{preview.original_name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-semibold text-gray-200 transition hover:bg-white/[0.1]"
                    aria-label="Close image preview"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Type</p>
                      <p className="mt-2 text-sm font-medium text-gray-100">{typeLabel(preview)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Size</p>
                      <p className="mt-2 text-sm font-medium text-gray-100">{humanSize(preview.size_bytes)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Added</p>
                    <p className="mt-2 text-sm leading-6 text-gray-200">{formatDateTime(preview.created_at)}</p>
                  </div>

                  {typeof preview.metadata?.note === 'string' && preview.metadata.note.length > 0 ? (
                    <div className="rounded-2xl border border-cyan-400/12 bg-cyan-400/[0.05] p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Attachment note</p>
                      <p className="mt-2 text-sm leading-6 text-gray-100 whitespace-pre-wrap">{preview.metadata.note}</p>
                    </div>
                  ) : null}

                  {typeof preview.metadata?.observer_note === 'string' && preview.metadata.observer_note.length > 0 ? (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Observer note</p>
                      <p className="mt-2 text-sm leading-6 text-cyan-100/90 whitespace-pre-wrap">{preview.metadata.observer_note}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-white/[0.06] p-4 sm:p-5 lg:p-6">
                <div className="flex flex-col gap-2.5">
                  <Link
                    href={preview.download_url}
                    target="_blank"
                    className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.12] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.18]"
                  >
                    Open full {fileKindLabel(preview)}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-200 transition hover:bg-white/[0.08]"
                  >
                    Back to attachments
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
}
