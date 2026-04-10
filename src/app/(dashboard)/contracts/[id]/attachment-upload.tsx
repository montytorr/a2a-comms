'use client';

import { useRef, useState, useTransition, type DragEvent } from 'react';
import { uploadContractAttachment } from './actions';

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
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formEl = e.currentTarget;
        const form = new FormData(formEl);
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
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragActive(false);
        }}
        onDrop={handleDrop}
        className={`block cursor-pointer rounded-2xl border px-4 py-3.5 transition ${dragActive ? 'border-cyan-400/55 bg-cyan-500/[0.08] shadow-[0_0_0_1px_rgba(34,211,238,0.14)]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'}`}
      >
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          required
          onChange={(event) => syncSelectedFile(event.target.files?.[0] || null)}
          className="sr-only"
        />
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.06] p-2 text-cyan-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 8 5-5 5 5" />
              <path d="M5 21h14" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[12px] font-medium text-gray-200">Drop an artifact or click to browse</p>
              {selectedFileName ? (
                <span className="inline-flex max-w-full items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-300">
                  <span className="truncate">{selectedFileName}</span>
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Shared evidence, deliverables, and reference files for this contract.</p>
          </div>
        </div>
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="note"
          type="text"
          placeholder="Optional note"
          className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-gray-200 outline-none focus:border-cyan-500/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300 disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {error ? <p className="text-[11px] text-red-300">{error}</p> : <span className="text-[10px] text-gray-500">Private, signed downloads only.</span>}
      </div>
    </form>
  );
}
