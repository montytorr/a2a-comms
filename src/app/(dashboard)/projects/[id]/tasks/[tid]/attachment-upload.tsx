'use client';

import { useRef, useState, useTransition, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { uploadTaskAttachment } from './actions';

export default function AttachmentUpload({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncSelectedFile = (file?: File | null) => {
    setSelectedFileName(file?.name || null);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || !fileInputRef.current) return;

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInputRef.current.files = dt.files;
    syncSelectedFile(file);
  };

  return (
    <form
      ref={formRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        const formEl = e.currentTarget;
        const form = new FormData(formEl);
        setError(null);
        startTransition(async () => {
          try {
            await uploadTaskAttachment(projectId, taskId, form);
            formRef.current?.reset();
            if (fileInputRef.current) fileInputRef.current.value = '';
            syncSelectedFile(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
          }
        });
      }}
    >
      <label
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragActive(false);
        }}
        onDrop={handleDrop}
        style={{
          display: 'block',
          cursor: 'pointer',
          borderRadius: 8,
          border: dragActive ? '1px solid var(--mint)' : '1px solid var(--line-1)',
          padding: '12px 14px',
          background: dragActive ? 'var(--mint-bg)' : 'var(--bg-2)',
          transition: 'border-color 0.15s, background 0.15s',
          boxShadow: dragActive ? '0 0 0 2px oklch(0.70 0.13 165 / 0.18)' : 'none',
        }}
      >
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          required
          onChange={(event) => syncSelectedFile(event.target.files?.[0] || null)}
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            marginTop: 2,
            borderRadius: 6,
            border: '1px solid var(--line-2)',
            background: 'var(--bg-3)',
            padding: 7,
            color: 'var(--mint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Upload size={15} strokeWidth={1.8} aria-hidden />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-1)' }}>Drop an attachment or click to browse</p>
              {selectedFileName && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  maxWidth: '100%',
                  borderRadius: 4,
                  border: '1px solid var(--line-2)',
                  background: 'var(--bg-3)',
                  padding: '2px 8px',
                  fontSize: 10,
                  color: 'var(--fg-2)',
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFileName}</span>
                </span>
              )}
            </div>
            <p style={{ marginTop: 4, fontSize: 11, color: 'var(--fg-3)' }}>Screenshots, markdown, notes, logs, and other small task artifacts.</p>
          </div>
        </div>
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            name="note"
            type="text"
            placeholder="Optional note"
            className="cp-input"
            style={{ minWidth: 0, flex: 1 }}
          />
          <button
            type="submit"
            disabled={pending}
            className="btn btn--sm"
            style={{ opacity: pending ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            {pending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {error
          ? <p style={{ fontSize: 11, color: 'var(--rose)' }}>{error}</p>
          : <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>Private, signed downloads only.</span>
        }
      </div>
    </form>
  );
}
