'use client';

import { useRef, useState, useTransition, type DragEvent } from 'react';
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
      className="space-y-3"
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
        className={`block cursor-pointer rounded-2xl border px-4 py-4 transition ${dragActive ? 'border-cyan-400/60 bg-cyan-500/[0.10] shadow-[0_0_0_1px_rgba(34,211,238,0.18)]' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.05]'}`}
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
          <div className="mt-0.5 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-2 text-cyan-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 8 5-5 5 5" />
              <path d="M5 21h14" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-gray-200">Drop an attachment here or click to browse</p>
            <p className="mt-1 text-[11px] text-gray-500">Works well for screenshots, markdown, notes, logs, and other task artifacts.</p>
            <p className="mt-2 text-[11px] text-cyan-200/90">{selectedFileName || 'No file selected yet'}</p>
          </div>
        </div>
      </label>

      <input
        name="note"
        type="text"
        placeholder="Optional note about this artifact"
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-gray-200 outline-none focus:border-cyan-500/30"
      />
      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload attachment'}
        </button>
        <span className="text-[10px] text-gray-500">Private, signed downloads only.</span>
      </div>
    </form>
  );
}
