'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import MarkdownPreview from '@/components/markdown-preview';
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

function isMarkdownAttachment(attachment: TaskAttachment) {
  const ext = extensionOf(attachment.original_name || attachment.filename || '');
  return attachment.mime_type === 'text/markdown' || attachment.mime_type === 'text/x-markdown' || ['md', 'markdown'].includes(ext);
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

function previewHrefOf(attachment: TaskAttachment) {
  return attachment.preview_url || attachment.download_url;
}

function openHrefOf(attachment: TaskAttachment) {
  if (isImageAttachment(attachment) || isPreviewableDocument(attachment)) {
    return previewHrefOf(attachment);
  }
  return attachment.download_url;
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
  const href = previewHrefOf(attachment);
  const isText = isTextAttachment(attachment);
  const isMarkdown = isMarkdownAttachment(attachment);
  const [textContent, setTextContent] = useState<string>('');
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!href || !isText) {
      return;
    }

    let cancelled = false;
    fetch(href)
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load preview');
        const text = await res.text();
        if (cancelled) return;
        const normalized = text.replace(/\r\n/g, '\n');
        setTextError(null);
        setTextContent(normalized.length > 8000 ? `${normalized.slice(0, 8000)}\n\n… Preview truncated` : normalized);
      })
      .catch((err) => {
        if (cancelled) return;
        setTextContent('');
        setTextError(err instanceof Error ? err.message : 'Unable to load preview');
      });

    return () => {
      cancelled = true;
    };
  }, [href, isText]);

  if (!href) {
    return <p className="text-sm text-gray-400">Preview unavailable for this file.</p>;
  }

  if (isImageAttachment(attachment)) {
    return (
      <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-auto rounded-[28px] border border-white/[0.08] bg-black/20 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-3 lg:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={attachment.original_name}
          className="block h-auto max-h-full w-auto max-w-full rounded-[22px] object-contain shadow-[0_28px_80px_rgba(0,0,0,0.5)]"
        />
      </div>
    );
  }

  if (isPdfAttachment(attachment)) {
    return (
      <iframe
        src={href}
        title={attachment.original_name}
        className="h-full min-h-0 w-full rounded-[28px] border border-white/[0.08] bg-white"
      />
    );
  }

  if (isVideoAttachment(attachment)) {
    return (
      <video
        src={href}
        controls
        className="h-full min-h-0 w-full rounded-[28px] border border-white/[0.08] bg-black shadow-[0_28px_80px_rgba(0,0,0,0.5)]"
      />
    );
  }

  if (isAudioAttachment(attachment)) {
    return (
      <div className="flex h-full min-h-[260px] w-full items-center justify-center rounded-[28px] border border-white/[0.08] bg-black/25 p-6 sm:p-8">
        <audio src={href} controls className="w-full max-w-3xl" />
      </div>
    );
  }

  if (isTextAttachment(attachment)) {
    if (textError) return <p className="text-sm text-red-200">{textError}</p>;
    if (!textContent) return <p className="text-sm text-gray-400">Loading text preview…</p>;
    if (isMarkdown) {
      return (
        <div className="h-full min-h-0 w-full overflow-auto rounded-[28px] border border-white/[0.08] bg-[#05070d]/96 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5 lg:p-7">
          <MarkdownPreview content={textContent} className="max-w-none" />
        </div>
      );
    }
    return (
      <pre className="h-full min-h-0 w-full overflow-auto rounded-[28px] border border-white/[0.08] bg-[#05070d]/96 p-4 text-[12px] leading-6 text-gray-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] whitespace-pre-wrap break-words sm:p-5 lg:p-7">
        {textContent}
      </pre>
    );
  }

  return (
    <div className="flex h-full min-h-[260px] w-full flex-col items-center justify-center rounded-[28px] border border-dashed border-white/[0.12] bg-black/20 p-8 text-center">
      <p className="text-sm font-medium text-gray-100">No inline preview for this file type yet.</p>
      <p className="mt-2 text-sm text-gray-400">Open it in a new tab or download it to inspect locally.</p>
    </div>
  );
}

function PreviewMetaPanel({ attachment }: { attachment: TaskAttachment }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Type</p>
          <p className="mt-2 text-sm font-medium text-gray-100">{typeLabel(attachment)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Size</p>
          <p className="mt-2 text-sm font-medium text-gray-100">{humanSize(attachment.size_bytes)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Added</p>
        <p className="mt-2 text-sm leading-6 text-gray-200">{formatDateTime(attachment.created_at)}</p>
      </div>

      {typeof attachment.metadata?.note === 'string' && attachment.metadata.note.length > 0 ? (
        <div className="rounded-2xl border border-cyan-400/12 bg-cyan-400/[0.05] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Attachment note</p>
          <p className="mt-2 text-sm leading-6 text-gray-100 whitespace-pre-wrap">{attachment.metadata.note}</p>
        </div>
      ) : null}

      {typeof attachment.metadata?.observer_note === 'string' && attachment.metadata.observer_note.length > 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Observer note</p>
          <p className="mt-2 text-sm leading-6 text-cyan-100/90 whitespace-pre-wrap">{attachment.metadata.observer_note}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function AttachmentListClient({ attachments }: { attachments: TaskAttachment[]; fallback?: ReactNode }) {
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sorted = useMemo(() => [...attachments].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [attachments]);

  if (!sorted.length) {
    return null;
  }

  return (
    <>
      <div className="space-y-2.5">
        {sorted.map((attachment) => {
          const isImage = isImageAttachment(attachment);
          const href = openHrefOf(attachment);
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
                    onClick={() => {
                      setPreview(attachment);
                      setDetailsOpen(false);
                    }}
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
                        onClick={() => {
                          setPreview(attachment);
                          setDetailsOpen(false);
                        }}
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
                      {canPreviewInline ? 'Open preview in new tab' : 'Download in new tab'}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {preview && previewHrefOf(preview) ? (
        <div className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md" onClick={() => setPreview(null)}>
          <div
            className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_28%),linear-gradient(180deg,_rgba(8,10,16,0.98),_rgba(2,4,8,1))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04)_0%,transparent_24%,transparent_76%,rgba(255,255,255,0.03)_100%)]" />

            <header className="relative z-10 flex items-start justify-between gap-3 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 lg:px-8">
              <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/35 px-3 py-2 backdrop-blur-xl sm:px-4 sm:py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/85 sm:text-[11px]">Attachment preview</p>
                <p className="mt-1 max-w-[min(72vw,920px)] truncate text-sm font-semibold text-white sm:text-base">{preview.original_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-300 sm:text-[11px]">
                  <span>{typeLabel(preview)}</span>
                  <span className="text-gray-500">•</span>
                  <span>{humanSize(preview.size_bytes)}</span>
                  <span className="text-gray-500">•</span>
                  <span>{formatDateTime(preview.created_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((current) => !current)}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.08] bg-black/35 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-100 backdrop-blur-xl transition hover:bg-black/50"
                >
                  {detailsOpen ? 'Hide details' : 'Show details'}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-black/35 text-sm font-semibold text-gray-100 backdrop-blur-xl transition hover:bg-black/50"
                  aria-label="Close attachment preview"
                >
                  ✕
                </button>
              </div>
            </header>

            <div className="relative z-0 flex min-h-0 flex-1 px-2 pb-2 sm:px-4 sm:pb-4 lg:px-6 lg:pb-6">
              <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden rounded-[30px] border border-white/[0.08] bg-black/25 shadow-[0_32px_90px_rgba(0,0,0,0.62)]">
                <div className="absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-black/35 to-transparent" />
                <div className="relative z-0 flex h-full min-h-0 w-full items-center justify-center p-2 sm:p-3 lg:p-4">
                  <InlinePreview attachment={preview} />
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 lg:px-8">
              <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-2xl rounded-2xl border border-white/[0.08] bg-black/35 px-3 py-2 text-[11px] text-gray-200 backdrop-blur-xl sm:px-4 sm:py-3">
                  Preserve the full-screen canvas while keeping open and download actions close at hand.
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={openHrefOf(preview) || '#'}
                    target="_blank"
                    className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.14] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.2]"
                  >
                    Open full {fileKindLabel(preview)}
                  </Link>
                  <Link
                    href={preview.download_url || openHrefOf(preview) || '#'}
                    target="_blank"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-100 transition hover:bg-white/[0.1]"
                  >
                    Download file
                  </Link>
                </div>
              </div>
            </div>

            {detailsOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close attachment details"
                  className="absolute inset-0 z-30 bg-black/40"
                  onClick={() => setDetailsOpen(false)}
                />
                <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-white/[0.08] bg-[#0b0c12]/96 shadow-[-28px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-5 lg:px-6">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/85">Details</p>
                      <p className="mt-1 truncate text-sm font-medium text-white">{preview.original_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailsOpen(false)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-semibold text-gray-100 transition hover:bg-white/[0.1]"
                      aria-label="Close attachment details"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
                    <PreviewMetaPanel attachment={preview} />
                  </div>
                </aside>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
