'use client';

import { useState, useTransition } from 'react';
import { uploadContractAttachment } from './actions';

export default function ContractAttachmentUpload({ contractId }: { contractId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            await uploadContractAttachment(contractId, form);
            (e.currentTarget as HTMLFormElement).reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
          }
        });
      }}
    >
      <input
        name="file"
        type="file"
        required
        className="block w-full text-[12px] text-gray-300 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-500/[0.12] file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-cyan-200"
      />
      <input
        name="note"
        type="text"
        placeholder="Optional note"
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-gray-200 outline-none focus:border-cyan-500/30"
      />
      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 disabled:opacity-50"
      >
        {pending ? 'Uploading…' : 'Upload contract artifact'}
      </button>
    </form>
  );
}
