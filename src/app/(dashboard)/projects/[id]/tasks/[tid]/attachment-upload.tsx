'use client';

import { useRef, useState, useTransition, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { uploadTaskAttachment } from './actions';
import styles from './attachment-upload.module.css';

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
    setError(null);
  };

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const formEl = e.currentTarget;
        // The file input is visually hidden, so `required` on it cannot work:
        // Chrome tries to focus an unfocusable invalid control, gives up, and
        // the submit silently does nothing. Validate it here instead.
        if (!fileInputRef.current?.files?.length) {
          setError('Choose a file to upload.');
          fileInputRef.current?.click();
          return;
        }
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
        className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
      >
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          className={styles.srOnly}
          onChange={(event) => { syncSelectedFile(event.target.files?.[0] || null); setError(null); }}
        />
        <span className={styles.dropzoneRow}>
          <span className={styles.dropzoneIcon}>
            <Upload size={15} strokeWidth={1.8} aria-hidden />
          </span>
          <span className={styles.dropzoneText}>
            <span className={styles.dropzoneTitleRow}>
              <span className={styles.dropzoneTitle}>Drop an attachment or click to browse</span>
              {selectedFileName && (
                <span className={styles.fileChip}><span>{selectedFileName}</span></span>
              )}
            </span>
            <span className={styles.dropzoneHint}>Screenshots, markdown, notes, logs, and other small task artifacts.</span>
          </span>
        </span>
      </label>

      <div className={styles.controls}>
        <label htmlFor="attachment-note" className={styles.srOnly}>Note</label>
        <input
          id="attachment-note"
          name="note"
          type="text"
          placeholder="Optional note"
          className="cp-input"
          style={{ minWidth: 0, flex: 1 }}
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn--primary btn--sm"
          style={{ opacity: pending ? 0.5 : 1, whiteSpace: 'nowrap' }}
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      <div className={styles.status} aria-live="polite">
        <span className={styles.helper}>Private, signed downloads only.</span>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </form>
  );
}
