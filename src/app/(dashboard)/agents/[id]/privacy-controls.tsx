'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentPrivacyMetadata } from '@/lib/types';
import { normalizeAgentPrivacyMetadata } from '@/lib/privacy-policy';

interface PrivacyControlsProps {
  agentId: string;
  initialPrivacy: AgentPrivacyMetadata | null | undefined;
  canEdit: boolean;
}

function asComparable(value: ReturnType<typeof normalizeAgentPrivacyMetadata>) {
  return JSON.stringify(value);
}

export default function PrivacyControls({ agentId, initialPrivacy, canEdit }: PrivacyControlsProps) {
  const router = useRouter();
  const normalizedInitial = useMemo(() => normalizeAgentPrivacyMetadata(initialPrivacy), [initialPrivacy]);
  const [dataHandling, setDataHandling] = useState<'standard' | 'confidential' | 'restricted'>(normalizedInitial.data_handling);
  const [retentionDays, setRetentionDays] = useState(String(normalizedInitial.retention_days));
  const [allowTraining, setAllowTraining] = useState(normalizedInitial.allow_training);
  const [allowOperatorExports, setAllowOperatorExports] = useState(normalizedInitial.allow_operator_exports);
  const [redactionLevel, setRedactionLevel] = useState<'standard' | 'enhanced' | 'strict'>(normalizedInitial.redaction_level);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const privacyMetadata = useMemo(() => normalizeAgentPrivacyMetadata({
    data_handling: dataHandling,
    retention_days: Number.parseInt(retentionDays, 10),
    allow_training: allowTraining,
    allow_operator_exports: allowOperatorExports,
    redaction_level: redactionLevel,
  }), [dataHandling, retentionDays, allowTraining, allowOperatorExports, redactionLevel]);

  const dirty = asComparable(privacyMetadata) !== asComparable(normalizedInitial);

  function handleSave() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privacy_metadata: privacyMetadata }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || 'Failed to update privacy controls');

        setSuccess('Privacy controls updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update privacy controls');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-fuchsia-500/15 bg-fuchsia-500/[0.04] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-[10px] font-semibold text-fuchsia-300 uppercase tracking-[0.18em]">Privacy & retention</p>
          <h2 className="text-[15px] font-semibold text-white mt-1">Agent data handling defaults</h2>
          <p className="text-[11px] text-gray-400 mt-1 max-w-xl">
            Sets the baseline for how this agent should be treated when it participates in contracts, tasks, and exports.
          </p>
        </div>
        {!canEdit && <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-gray-500">View only</span>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Handling level</label>
          <select value={dataHandling} disabled={!canEdit || isPending} onChange={(e) => setDataHandling(e.target.value as 'standard' | 'confidential' | 'restricted')} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200">
            <option value="standard">Standard</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
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
          <input type="checkbox" checked={allowTraining} disabled={!canEdit || isPending} onChange={(e) => setAllowTraining(e.target.checked)} />
          Allow training or model improvement use
        </label>
        <label className="flex items-center gap-2 text-[12px] text-gray-300">
          <input type="checkbox" checked={allowOperatorExports} disabled={!canEdit || isPending} onChange={(e) => setAllowOperatorExports(e.target.checked)} />
          Allow operator exports
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-gray-500">These are defaults, not automatic deletion jobs. Honest metadata first, enforcement second.</div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[11px] text-red-300">{error}</span>}
          {success && !error && <span className="text-[11px] text-emerald-300">{success}</span>}
          {canEdit && (
            <button type="button" onClick={handleSave} disabled={!dirty || isPending} className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 text-[11px] font-semibold text-fuchsia-300 hover:bg-fuchsia-500/30 disabled:opacity-40">
              {isPending ? 'Saving…' : 'Save privacy controls'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
