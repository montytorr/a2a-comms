'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectPrivacyMetadata } from '@/lib/types';
import { normalizeProjectPrivacyMetadata } from '@/lib/privacy-policy';

interface ProjectPrivacyControlsProps {
  projectId: string;
  initialPrivacy: ProjectPrivacyMetadata | null | undefined;
  canEdit: boolean;
}

function comparable(value: ReturnType<typeof normalizeProjectPrivacyMetadata>) {
  return JSON.stringify(value);
}

export default function ProjectPrivacyControls({ projectId, initialPrivacy, canEdit }: ProjectPrivacyControlsProps) {
  const router = useRouter();
  const normalizedInitial = useMemo(() => normalizeProjectPrivacyMetadata(initialPrivacy), [initialPrivacy]);
  const [visibility, setVisibility] = useState<'standard' | 'confidential' | 'restricted'>(normalizedInitial.visibility);
  const [retentionMode, setRetentionMode] = useState<'standard' | 'short' | 'strict'>(normalizedInitial.retention_mode);
  const [retentionDays, setRetentionDays] = useState(String(normalizedInitial.retention_days));
  const [allowObserverAccess, setAllowObserverAccess] = useState(normalizedInitial.allow_observer_access);
  const [allowExports, setAllowExports] = useState(normalizedInitial.allow_exports);
  const [redactionLevel, setRedactionLevel] = useState<'standard' | 'enhanced' | 'strict'>(normalizedInitial.redaction_level);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const privacyMetadata = useMemo(() => normalizeProjectPrivacyMetadata({
    visibility,
    retention_mode: retentionMode,
    retention_days: Number.parseInt(retentionDays, 10),
    allow_observer_access: allowObserverAccess,
    allow_exports: allowExports,
    redaction_level: redactionLevel,
  }), [visibility, retentionMode, retentionDays, allowObserverAccess, allowExports, redactionLevel]);

  const dirty = comparable(privacyMetadata) !== comparable(normalizedInitial);

  function save() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privacy_metadata: privacyMetadata }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || 'Failed to update project privacy controls');
        setSuccess('Project privacy controls updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update project privacy controls');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-fuchsia-500/15 bg-fuchsia-500/[0.04] p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-[10px] font-semibold text-fuchsia-300 uppercase tracking-[0.18em]">Privacy policy</p>
          <h3 className="text-[15px] font-semibold text-white mt-1">Project retention and visibility</h3>
          <p className="text-[11px] text-gray-400 mt-1 max-w-xl">Operator-facing metadata for how long this project should persist and how tightly collaboration is scoped.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Visibility</label>
          <select value={visibility} disabled={!canEdit || isPending} onChange={(e) => setVisibility(e.target.value as 'standard' | 'confidential' | 'restricted')} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200">
            <option value="standard">Standard</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Retention mode</label>
          <select value={retentionMode} disabled={!canEdit || isPending} onChange={(e) => setRetentionMode(e.target.value as 'standard' | 'short' | 'strict')} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200">
            <option value="standard">Standard</option>
            <option value="short">Short</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Retention days</label>
          <input value={retentionDays} disabled={!canEdit || isPending} onChange={(e) => setRetentionDays(e.target.value)} inputMode="numeric" className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Redaction level</label>
          <select value={redactionLevel} disabled={!canEdit || isPending} onChange={(e) => setRedactionLevel(e.target.value as 'standard' | 'enhanced' | 'strict')} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200">
            <option value="standard">Standard</option>
            <option value="enhanced">Enhanced</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-gray-300">
          <input type="checkbox" checked={allowObserverAccess} disabled={!canEdit || isPending} onChange={(e) => setAllowObserverAccess(e.target.checked)} />
          Allow observer access
        </label>
        <label className="flex items-center gap-2 text-[12px] text-gray-300">
          <input type="checkbox" checked={allowExports} disabled={!canEdit || isPending} onChange={(e) => setAllowExports(e.target.checked)} />
          Allow exports
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-gray-500">This currently gates observer access immediately. Retention/export flags are surfaced as policy metadata for operators and downstream automation.</div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[11px] text-red-300">{error}</span>}
          {success && !error && <span className="text-[11px] text-emerald-300">{success}</span>}
          {canEdit && <button type="button" onClick={save} disabled={!dirty || isPending} className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 text-[11px] font-semibold text-fuchsia-300 hover:bg-fuchsia-500/30 disabled:opacity-40">{isPending ? 'Saving…' : 'Save privacy policy'}</button>}
        </div>
      </div>
    </div>
  );
}
