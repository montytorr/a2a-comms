'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import MarkdownPreview from '@/components/markdown-preview';
import type { TaskAttachment } from '@/lib/types';
import { formatDateTime } from '@/lib/format-date';

const humanSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const extensionOf = (name: string) => {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
};

const isImageAttachment = (a: TaskAttachment) => a.mime_type.startsWith('image/');
const isTextAttachment = (a: TaskAttachment) => {
  const ext = extensionOf(a.original_name || a.filename || '');
  return a.mime_type.startsWith('text/') || ['md', 'markdown', 'txt', 'json', 'log', 'yaml', 'yml', 'csv'].includes(ext);
};
const isMarkdownAttachment = (a: TaskAttachment) => {
  const ext = extensionOf(a.original_name || a.filename || '');
  return a.mime_type === 'text/markdown' || a.mime_type === 'text/x-markdown' || ['md', 'markdown'].includes(ext);
};
const isPdfAttachment = (a: TaskAttachment) => a.mime_type === 'application/pdf' || extensionOf(a.original_name || a.filename || '') === 'pdf';
const isVideoAttachment = (a: TaskAttachment) => a.mime_type.startsWith('video/');
const isAudioAttachment = (a: TaskAttachment) => a.mime_type.startsWith('audio/');
const isPreviewableDocument = (a: TaskAttachment) => isTextAttachment(a) || isPdfAttachment(a) || isVideoAttachment(a) || isAudioAttachment(a);

const typeLabel = (a: TaskAttachment) => {
  if (isImageAttachment(a)) return 'Image';
  if (isPdfAttachment(a)) return 'PDF';
  if (isVideoAttachment(a)) return 'Video';
  if (isAudioAttachment(a)) return 'Audio';
  if (isTextAttachment(a)) return 'Text';
  return 'File';
};

const actionLabel = (a: TaskAttachment) => {
  if (isImageAttachment(a)) return 'Preview';
  if (isPreviewableDocument(a)) return 'Open';
  return 'Download';
};

const previewHrefOf = (a: TaskAttachment) => a.preview_url || a.download_url;
const openHrefOf = (a: TaskAttachment) => {
  if (isImageAttachment(a) || isPreviewableDocument(a)) return previewHrefOf(a);
  return a.download_url;
};
const fileKindLabel = (a: TaskAttachment) => {
  if (isImageAttachment(a)) return 'image';
  if (isPdfAttachment(a)) return 'PDF';
  if (isVideoAttachment(a)) return 'video';
  if (isAudioAttachment(a)) return 'audio';
  if (isTextAttachment(a)) return 'text';
  return 'file';
};

const InlinePreview = ({ attachment }: { attachment: TaskAttachment }) => {
  const href = previewHrefOf(attachment);
  const isText = isTextAttachment(attachment);
  const isMd = isMarkdownAttachment(attachment);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!href || !isText) return;
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
        setTextContent(null);
        setTextError(err instanceof Error ? err.message : 'Unable to load preview');
      });
    return () => { cancelled = true; };
  }, [href, isText]);

  if (!href) return <p className="dim text-sm">Preview unavailable for this file.</p>;

  if (isImageAttachment(attachment)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 0, width: '100%', overflow: 'auto', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'var(--bg-0)', padding: 'var(--space-2)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={attachment.original_name} style={{ display: 'block', maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: 'var(--radius-2)' }} />
      </div>
    );
  }

  if (isPdfAttachment(attachment)) {
    return <iframe src={href} title={attachment.original_name} style={{ height: '100%', minHeight: 0, width: '100%', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)' }} />;
  }
  if (isVideoAttachment(attachment)) {
    return <video src={href} controls style={{ height: '100%', minHeight: 0, width: '100%', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'black' }} />;
  }
  if (isAudioAttachment(attachment)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 260, width: '100%', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'var(--bg-2)', padding: 'var(--space-5)' }}>
        <audio src={href} controls style={{ width: '100%', maxWidth: 600 }} />
      </div>
    );
  }
  if (isText) {
    if (textError) return <p className="text-sm" style={{ color: 'var(--rose)' }}>{textError}</p>;
    if (textContent === null) return <p className="dim text-sm">Loading text preview…</p>;
    if (isMd) {
      return (
        <div style={{ height: '100%', minHeight: 0, width: '100%', overflow: 'auto', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'var(--bg-0)', padding: 20 }}>
          <MarkdownPreview content={textContent} className="" />
        </div>
      );
    }
    return (
      <pre className="mono text-xs" style={{ height: '100%', minHeight: 0, width: '100%', overflow: 'auto', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'var(--bg-0)', padding: 20, lineHeight: 1.6, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
        {textContent}
      </pre>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 260, width: '100%', borderRadius: 'var(--radius-3)', border: '1px dashed var(--line-2)', background: 'var(--bg-2)', padding: 'var(--space-6)', textAlign: 'center' }}>
      <div className="text-sm" style={{ fontWeight: 500, color: 'var(--fg-1)' }}>No inline preview for this file type yet.</div>
      <div className="dim text-sm" style={{ marginTop: 8 }}>Open it in a new tab or download it to inspect locally.</div>
    </div>
  );
};

const PreviewMetaPanel = ({ attachment }: { attachment: TaskAttachment }) => (
  <div className="col gap-4">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <div className="card" style={{ padding: 'var(--space-3)' }}>
        <div className="upper text-2xs">Type</div>
        <div className="text-sm" style={{ marginTop: 8, fontWeight: 500, color: 'var(--fg-1)' }}>{typeLabel(attachment)}</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-3)' }}>
        <div className="upper text-2xs">Size</div>
        <div className="text-sm" style={{ marginTop: 8, fontWeight: 500, color: 'var(--fg-1)' }}>{humanSize(attachment.size_bytes)}</div>
      </div>
    </div>
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div className="upper text-2xs">Added</div>
      <div className="mono num text-sm" style={{ marginTop: 8, color: 'var(--fg-1)' }}>{formatDateTime(attachment.created_at)}</div>
    </div>
    {typeof attachment.metadata?.note === 'string' && attachment.metadata.note.length > 0 && (
      <div className="card" style={{ padding: 'var(--space-4)', borderColor: 'var(--mint-line)' }}>
        <div className="upper text-2xs" style={{ color: 'var(--mint)' }}>Attachment note</div>
        <div className="text-sm" style={{ marginTop: 8, color: 'var(--fg-1)', whiteSpace: 'pre-wrap' }}>{attachment.metadata.note}</div>
      </div>
    )}
    {typeof attachment.metadata?.observer_note === 'string' && attachment.metadata.observer_note.length > 0 && (
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="upper text-2xs">Observer note</div>
        <div className="text-sm" style={{ marginTop: 8, color: 'var(--peri)', whiteSpace: 'pre-wrap' }}>{attachment.metadata.observer_note}</div>
      </div>
    )}
  </div>
);

const AttachmentPreviewModal = ({
  attachment, detailsOpen, onClose, onToggleDetails,
}: {
  attachment: TaskAttachment;
  detailsOpen: boolean;
  onClose: () => void;
  onToggleDetails: () => void;
}) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { detailsOpen ? onToggleDetails() : onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [detailsOpen, onClose, onToggleDetails]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647, isolation: 'isolate' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(12px)' }} />
      <div
        style={{ position: 'relative', display: 'flex', height: '100dvh', width: '100vw', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="row" style={{ justifyContent: 'space-between', gap: 12, padding: '12px 16px', zIndex: 10 }}>
          <div className="card card--inset" style={{ padding: '8px 14px' }}>
            <div className="upper text-2xs">Attachment preview</div>
            <div className="text-sm" style={{ marginTop: 4, fontWeight: 600, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60vw' }}>
              {attachment.original_name}
            </div>
            <div className="row gap-2 mono dim text-2xs" style={{ marginTop: 4 }}>
              <span>{typeLabel(attachment)}</span>
              <span style={{ color: 'var(--fg-4)' }}>·</span>
              <span>{humanSize(attachment.size_bytes)}</span>
              <span style={{ color: 'var(--fg-4)' }}>·</span>
              <span>{formatDateTime(attachment.created_at)}</span>
            </div>
          </div>
          <div className="row gap-2">
            <button onClick={onToggleDetails} className="btn btn--sm">
              {detailsOpen ? 'Hide details' : 'Show details'}
            </button>
            <button onClick={onClose} className="btn btn--sm btn--icon" aria-label="Close preview" style={{ width: 32, height: 32 }}>
              ✕
            </button>
          </div>
        </header>

        {/* Preview area */}
        <div style={{ flex: 1, minHeight: 0, padding: '0 8px 8px', display: 'flex' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'var(--bg-2)', padding: 'var(--space-2)' }}>
            <InlinePreview attachment={attachment} />
          </div>
        </div>

        {/* Bottom actions */}
        <div className="row gap-2" style={{ justifyContent: 'flex-end', padding: '8px 16px 12px' }}>
          {openHrefOf(attachment) && (
            <Link href={openHrefOf(attachment)!} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm" style={{ textDecoration: 'none' }}>
              Open full {fileKindLabel(attachment)}
            </Link>
          )}
          {(attachment.download_url || openHrefOf(attachment)) && (
            <Link href={attachment.download_url || openHrefOf(attachment)!} target="_blank" rel="noopener noreferrer" className="btn btn--sm" style={{ textDecoration: 'none' }}>
              Download file
            </Link>
          )}
        </div>

        {/* Details sidebar */}
        {detailsOpen && (
          <>
            <button type="button" aria-label="Close details" style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--scrim)' }} onClick={onToggleDetails} />
            <aside style={{
              position: 'absolute', inset: '0 0 0 auto', zIndex: 40,
              width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid var(--line-1)', background: 'var(--bg-inset)', backdropFilter: 'blur(24px)',
            }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--line-1)', padding: '16px 20px' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="upper text-2xs">Details</div>
                  <div className="text-sm" style={{ marginTop: 4, fontWeight: 500, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {attachment.original_name}
                  </div>
                </div>
                <button onClick={onToggleDetails} className="btn btn--sm btn--icon" aria-label="Close details" style={{ width: 32, height: 32 }}>✕</button>
              </div>
              <div className="scroll" style={{ flex: 1, padding: 20 }}>
                <PreviewMetaPanel attachment={attachment} />
              </div>
            </aside>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default function AttachmentListClient({ attachments }: { attachments: TaskAttachment[]; fallback?: ReactNode }) {
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sorted = useMemo(() => [...attachments].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [attachments]);

  if (!sorted.length) return null;

  return (
    <>
      <div className="col gap-3">
        {sorted.map((attachment) => {
          const isImage = isImageAttachment(attachment);
          const href = openHrefOf(attachment);
          const note = typeof attachment.metadata?.note === 'string' && attachment.metadata.note.length > 0 ? attachment.metadata.note : null;
          const observerNote = typeof attachment.metadata?.observer_note === 'string' && attachment.metadata.observer_note.length > 0 ? attachment.metadata.observer_note : null;
          const canPreviewInline = !!href && (isImage || isPreviewableDocument(attachment));

          return (
            <div key={attachment.id} className="card" style={{ overflow: 'hidden' }}>
              <div className="row gap-4" style={{ padding: 'var(--space-4)', alignItems: 'flex-start' }}>
                {isImage && href ? (
                  <button
                    type="button"
                    onClick={() => { setPreview(attachment); setDetailsOpen(false); }}
                    style={{ width: 64, height: 64, overflow: 'hidden', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'var(--bg-0)', flexShrink: 0, cursor: 'pointer', padding: 0 }}
                    aria-label={`Preview ${attachment.original_name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={href} alt={attachment.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ) : (
                  <div className="upper text-2xs" style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-3)', border: '1px solid var(--line-1)', background: 'var(--bg-2)', flexShrink: 0 }}>
                    {typeLabel(attachment)}
                  </div>
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="text-sm" style={{ fontWeight: 500, color: 'var(--fg-0)', wordBreak: 'break-word' }}>{attachment.original_name}</div>
                  <div className="row gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="pill pill--ghost text-2xs" style={{ height: 18 }}>{typeLabel(attachment)}</span>
                    <span className="mono dim text-2xs">{humanSize(attachment.size_bytes)}</span>
                    <span className="dim text-2xs">·</span>
                    <span className="mono dim text-2xs">{formatDateTime(attachment.created_at)}</span>
                  </div>
                  {note && <div className="dim text-xs" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{note}</div>}
                  {observerNote && <div className="text-2xs" style={{ color: 'var(--peri)', marginTop: 6 }}>Observer note: {observerNote}</div>}
                </div>

                {href && (
                  <div className="col gap-2" style={{ flexShrink: 0 }}>
                    {canPreviewInline && (
                      <button type="button" onClick={() => { setPreview(attachment); setDetailsOpen(false); }} className="btn btn--sm">
                        {actionLabel(attachment)} {fileKindLabel(attachment)}
                      </button>
                    )}
                    <Link href={href} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm" style={{ textDecoration: 'none' }}>
                      {canPreviewInline ? 'Open in new tab' : 'Download'}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {preview && previewHrefOf(preview) && (
        <AttachmentPreviewModal
          attachment={preview}
          detailsOpen={detailsOpen}
          onClose={() => setPreview(null)}
          onToggleDetails={() => setDetailsOpen((c) => !c)}
        />
      )}
    </>
  );
}
