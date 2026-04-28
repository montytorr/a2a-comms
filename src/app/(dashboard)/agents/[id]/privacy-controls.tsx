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
    <div className="card" style={{ padding: '1.25rem', borderRadius: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <p className="upper" style={{ fontSize: '10px', color: 'var(--peri)', fontWeight: 600 }}>Privacy &amp; retention</p>
          <h2 className="h3" style={{ marginTop: '0.25rem' }}>Agent data handling defaults</h2>
          <p className="muted" style={{ fontSize: '11px', marginTop: '0.25rem', maxWidth: '36rem' }}>
            Sets the default data-handling posture for this agent when it participates in contracts, tasks, exports, and downstream review or automation flows.
          </p>
          <div className="card--inset" style={{ marginTop: '0.75rem', padding: '0.875rem 1rem', fontSize: '11px', color: 'var(--fg-2)', display: 'flex', flexDirection: 'column', gap: '0.375rem', maxWidth: '48rem' }}>
            <p><span style={{ fontWeight: 500, color: 'var(--fg-0)' }}>Handling level</span> describes how carefully operators and downstream automations should treat this agent&apos;s data by default.</p>
            <p><span style={{ fontWeight: 500, color: 'var(--fg-0)' }}>Retention days</span> is the intended storage window, not an automatic purge timer by itself.</p>
            <p><span style={{ fontWeight: 500, color: 'var(--fg-0)' }}>Redaction level</span> signals how aggressively logs, exports, and summaries should remove or mask sensitive details.</p>
            <p><span style={{ fontWeight: 500, color: 'var(--fg-0)' }}>Training and export toggles</span> describe what downstream use is allowed. They do not override trust policy, project membership, or approval requirements.</p>
          </div>
        </div>
        {!canEdit && <span className="pill pill--ghost">View only</span>}
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div>
          <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>Handling level</label>
          <select
            value={dataHandling}
            disabled={!canEdit || isPending}
            onChange={(e) => setDataHandling(e.target.value as 'standard' | 'confidential' | 'restricted')}
            className="cp-select"
            style={{ width: '100%', opacity: !canEdit || isPending ? 0.6 : 1 }}
          >
            <option value="standard">Standard</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
          <p className="dim" style={{ marginTop: '0.5rem', fontSize: '11px' }}>Standard suits ordinary collaboration, confidential asks for tighter handling, and restricted signals especially sensitive material.</p>
        </div>
        <div>
          <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>Retention days</label>
          <input
            value={retentionDays}
            disabled={!canEdit || isPending}
            onChange={(e) => setRetentionDays(e.target.value)}
            inputMode="numeric"
            className="cp-input"
            style={{ width: '100%', opacity: !canEdit || isPending ? 0.6 : 1 }}
          />
          <p className="dim" style={{ marginTop: '0.5rem', fontSize: '11px' }}>This is the intended default storage window for related records and artifacts. It documents policy intent unless a janitor or export workflow explicitly enforces it.</p>
        </div>
        <div>
          <label className="upper dim" style={{ display: 'block', fontSize: '10px', marginBottom: '0.5rem' }}>Redaction level</label>
          <select
            value={redactionLevel}
            disabled={!canEdit || isPending}
            onChange={(e) => setRedactionLevel(e.target.value as 'standard' | 'enhanced' | 'strict')}
            className="cp-select"
            style={{ width: '100%', opacity: !canEdit || isPending ? 0.6 : 1 }}
          >
            <option value="standard">Standard</option>
            <option value="enhanced">Enhanced</option>
            <option value="strict">Strict</option>
          </select>
          <p className="dim" style={{ marginTop: '0.5rem', fontSize: '11px' }}>Higher redaction levels mean logs, exports, and summaries should reveal less raw detail and mask more sensitive content.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', color: 'var(--fg-1)' }}>
            <input type="checkbox" checked={allowTraining} disabled={!canEdit || isPending} onChange={(e) => setAllowTraining(e.target.checked)} />
            Allow training or model improvement use
          </label>
          <p className="dim" style={{ fontSize: '11px' }}>Turn this off when this agent&apos;s work should not be reused for model training, fine-tuning, or similar improvement pipelines.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', color: 'var(--fg-1)' }}>
            <input type="checkbox" checked={allowOperatorExports} disabled={!canEdit || isPending} onChange={(e) => setAllowOperatorExports(e.target.checked)} />
            Allow operator exports
          </label>
          <p className="dim" style={{ fontSize: '11px' }}>Controls whether operators and downstream workflows should treat exports from this agent&apos;s data as permitted by default.</p>
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="dim" style={{ fontSize: '11px' }}>These are defaults and metadata, not automatic deletion jobs. They inform operator expectations and downstream automation, but they do not themselves purge data or override trust and membership checks.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {error && <span style={{ fontSize: '11px', color: 'var(--rose)' }}>{error}</span>}
          {success && !error && <span style={{ fontSize: '11px', color: 'var(--mint)' }}>{success}</span>}
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isPending}
              className="btn btn--ghost btn--sm"
              style={{ color: 'var(--peri)', borderColor: 'var(--peri-bg)' }}
            >
              {isPending ? 'Saving…' : 'Save privacy controls'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
