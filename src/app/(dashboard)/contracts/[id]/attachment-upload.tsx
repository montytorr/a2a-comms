'use client';

import { useRef, useState, useTransition, type DragEvent } from 'react';
import { uploadContractAttachment } from './actions';
import { Upload } from 'lucide-react';

export default function ContractAttachmentUpload({ contractId }: { contractId: string }) {
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
      className="col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            await uploadContractAttachment(contractId, form);
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
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragActive(false);
        }}
        onDrop={handleDrop}
        className="card card--inset"
        style={{
          padding: 14,
          cursor: 'pointer',
          border: dragActive ? '1px dashed var(--amber)' : '1px dashed var(--line-2)',
          background: dragActive ? 'var(--amber-bg)' : undefined,
          textAlign: 'center',
          display: 'block',
          transition: 'all 0.12s',
        }}
      >
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          required
          onChange={(event) => syncSelectedFile(event.target.files?.[0] || null)}
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
        />
        <Upload size={18} style={{ color: 'var(--fg-3)', margin: '0 auto' }} />
        <div style={{ fontSize: 12, marginTop: 6, color: 'var(--fg-1)' }}>
          {selectedFileName ? (
            <span className="pill pill--ghost" style={{ fontSize: 10 }}>{selectedFileName}</span>
          ) : (
            'Drop an artifact or click to browse'
          )}
        </div>
        <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
          Shared evidence, deliverables, and reference files for this contract.
        </div>
      </label>

      <div className="row gap-2">
        <input
          name="note"
          type="text"
          placeholder="Optional note"
          className="cp-input"
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn--primary btn--sm"
          style={{ opacity: pending ? 0.5 : 1 }}
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        {error ? (
          <span style={{ fontSize: 11, color: 'var(--rose)' }}>{error}</span>
        ) : (
          <span className="dim" style={{ fontSize: 10 }}>Private, signed downloads only.</span>
        )}
      </div>
    </form>
  );
}
