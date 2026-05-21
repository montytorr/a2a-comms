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
  const [textContent, setTextContent] = useState('');
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
        setTextContent('');
        setTextError(err instanceof Error ? err.message : 'Unable to load preview');
      });
    return () => { cancelled = true; };
  }, [href, isText]);

  if (!href) return <p className="dim" style={{ fontSize: 13 }}>Preview unavailable for this file.</p>;

  if (isImageAttachment(attachment)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 0, width: '100%', overflow: 'auto', borderRadius: 8, border: '1px solid var(--line-1)', background: 'oklch(0.10 0.01 250)', padding: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={attachment.original_name} style={{ display: 'block', maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
      </div>
    );
  }

  if (isPdfAttachment(attachment)) {
    return <iframe src={href} title={attachment.original_name} style={{ height: '100%', minHeight: 0, width: '100%', borderRadius: 8, border: '1px solid var(--line-1)' }} />;
  }
  if (isVideoAttachment(attachment)) {
    return <video src={href} controls style={{ height: '100%', minHeight: 0, width: '100%', borderRadius: 8, border: '1px solid var(--line-1)', background: 'black' }} />;
  }
  if (isAudioAttachment(attachment)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 260, width: '100%', borderRadius: 8, border: '1px solid var(--line-1)', background: 'var(--bg-2)', padding: 24 }}>
        <audio src={href} controls style={{ width: '100%', maxWidth: 600 }} />
      </div>
    );
  }
  if (isText) {
    if (textError) return <p style={{ fontSize: 13, color: 'var(--rose)' }}>{textError}</p>;
    if (!textContent) return <p className="dim" style={{ fontSize: 13 }}>Loading text preview…</p>;
    if (isMd) {
      return (
        <div style={{ height: '100%', minHeight: 0, width: '100%', overflow: 'auto', borderRadius: 8, border: '1px solid var(--line-1)', background: 'var(--bg-0)', padding: 20 }}>
          <MarkdownPreview content={textContent} className="" />
        </div>
      );
    }
    return (
      <pre className="mono" style={{ height: '100%', minHeight: 0, width: '100%', overflow: 'auto', borderRadius: 8, border: '1px solid var(--line-1)', background: 'var(--bg-0)', padding: 20, fontSize: 12, lineHeight: 1.6, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
        {textContent}
      </pre>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 260, width: '100%', borderRadius: 8, border: '1px dashed var(--line-2)', background: 'var(--bg-2)', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>No inline preview for this file type yet.</div>
      <div className="dim" style={{ fontSize: 13, marginTop: 8 }}>Open it in a new tab or download it to inspect locally.</div>
    </div>
  );
};

const PreviewMetaPanel = ({ attachment }: { attachment: TaskAttachment }) => (
  <div className="col gap-4">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="card" style={{ padding: 12 }}>
        <div className="upper" style={{ fontSize: 10 }}>Type</div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{typeLabel(attachment)}</div>
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="upper" style={{ fontSize: 10 }}>Size</div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{humanSize(attachment.size_bytes)}</div>
      </div>
    </div>
    <div className="card" style={{ padding: 16 }}>
      <div className="upper" style={{ fontSize: 10 }}>Added</div>
      <div className="mono num" style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-1)' }}>{formatDateTime(attachment.created_at)}</div>
    </div>
    {typeof attachment.metadata?.note === 'string' && attachment.metadata.note.length > 0 && (
      <div className="card" style={{ padding: 16, borderColor: 'oklch(0.50 0.10 165 / 0.3)' }}>
        <div className="upper" style={{ fontSize: 10, color: 'var(--mint)' }}>Attachment note</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'pre-wrap' }}>{attachment.metadata.note}</div>
      </div>
    )}
    {typeof attachment.metadata?.observer_note === 'string' && attachment.metadata.observer_note.length > 0 && (
      <div className="card" style={{ padding: 16 }}>
        <div className="upper" style={{ fontSize: 10 }}>Observer note</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--peri)', whiteSpace: 'pre-wrap' }}>{attachment.metadata.observer_note}</div>
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
      <div style={{ position: 'absolute', inset: 0, background: 'oklch(0.05 0.01 250 / 0.95)', backdropFilter: 'blur(12px)' }} />
      <div
        style={{ position: 'relative', display: 'flex', height: '100dvh', width: '100vw', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="row" style={{ justifyContent: 'space-between', gap: 12, padding: '12px 16px', zIndex: 10 }}>
          <div className="card card--inset" style={{ padding: '8px 14px' }}>
            <div className="upper" style={{ fontSize: 10 }}>Attachment preview</div>
            <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60vw' }}>
              {attachment.original_name}
            </div>
            <div className="row gap-2 mono dim" style={{ marginTop: 4, fontSize: 11 }}>
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 8, border: '1px solid var(--line-1)', background: 'var(--bg-2)', padding: 8 }}>
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
            <button type="button" aria-label="Close details" style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'oklch(0 0 0 / 0.4)' }} onClick={onToggleDetails} />
            <aside style={{
              position: 'absolute', inset: '0 0 0 auto', zIndex: 40,
              width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid var(--line-1)', background: 'oklch(0.12 0.012 250 / 0.96)', backdropFilter: 'blur(24px)',
            }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--line-1)', padding: '16px 20px' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="upper" style={{ fontSize: 10 }}>Details</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              <div className="row gap-4" style={{ padding: 16, alignItems: 'flex-start' }}>
                {isImage && href ? (
                  <button
                    type="button"
                    onClick={() => { setPreview(attachment); setDetailsOpen(false); }}
                    style={{ width: 64, height: 64, overflow: 'hidden', borderRadius: 8, border: '1px solid var(--line-1)', background: 'var(--bg-0)', flexShrink: 0, cursor: 'pointer', padding: 0 }}
                    aria-label={`Preview ${attachment.original_name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={href} alt={attachment.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ) : (
                  <div className="upper" style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--line-1)', background: 'var(--bg-2)', fontSize: 10, flexShrink: 0 }}>
                    {typeLabel(attachment)}
                  </div>
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-0)', wordBreak: 'break-word' }}>{attachment.original_name}</div>
                  <div className="row gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="pill pill--ghost" style={{ height: 18, fontSize: 9 }}>{typeLabel(attachment)}</span>
                    <span className="mono dim" style={{ fontSize: 11 }}>{humanSize(attachment.size_bytes)}</span>
                    <span className="dim" style={{ fontSize: 11 }}>·</span>
                    <span className="mono dim" style={{ fontSize: 11 }}>{formatDateTime(attachment.created_at)}</span>
                  </div>
                  {note && <div className="dim" style={{ fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' }}>{note}</div>}
                  {observerNote && <div style={{ fontSize: 11, color: 'var(--peri)', marginTop: 6 }}>Observer note: {observerNote}</div>}
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
