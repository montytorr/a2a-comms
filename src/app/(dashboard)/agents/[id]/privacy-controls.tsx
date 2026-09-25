'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentPrivacyMetadata } from '@/lib/types';
import { normalizeAgentPrivacyMetadata } from '@/lib/privacy-policy';
import { updateAgentPrivacy } from './actions';
import styles from './agent-detail.module.css';

interface PrivacyControlsProps {
  agentId: string;
  initialPrivacy: AgentPrivacyMetadata | null | undefined;
  canEdit: boolean;
}

export default function PrivacyControls({ agentId, initialPrivacy, canEdit }: PrivacyControlsProps) {
  const router = useRouter();
  const normalizedInitial = useMemo(() => normalizeAgentPrivacyMetadata(initialPrivacy), [initialPrivacy]);
  const [dataHandling, setDataHandling] = useState(normalizedInitial.data_handling);
  const [retentionDays, setRetentionDays] = useState(String(normalizedInitial.retention_days));
  const [allowTraining, setAllowTraining] = useState(normalizedInitial.allow_training);
  const [allowOperatorExports, setAllowOperatorExports] = useState(normalizedInitial.allow_operator_exports);
  const [redactionLevel, setRedactionLevel] = useState(normalizedInitial.redaction_level);
  const [editing, setEditing] = useState(false);
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

  const dirty = JSON.stringify(privacyMetadata) !== JSON.stringify(normalizedInitial);

  function handleSave() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await updateAgentPrivacy(agentId, privacyMetadata);
        if (!result.success) throw new Error(result.error || 'Failed to update posture');
        setSuccess('Declared posture updated.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update posture');
      }
    });
  }

  /* The same five values the editor writes. They used to be rendered a second
     time as a separate read-only card higher up the page. */
  const tiles = [
    { label: 'Handling', value: normalizedInitial.data_handling },
    { label: 'Retention', value: `${normalizedInitial.retention_days} days` },
    { label: 'Redaction', value: normalizedInitial.redaction_level },
    { label: 'Training reuse', value: normalizedInitial.allow_training ? 'Allowed' : 'Blocked' },
    { label: 'Operator exports', value: normalizedInitial.allow_operator_exports ? 'Allowed' : 'Restricted' },
  ];

  return (
    <section className={`card ${styles.section} ${styles.posture}`} aria-labelledby="agent-posture-heading">
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadText}>
          <p className={styles.eyebrow} style={{ color: 'var(--fg-3)' }}>Declared</p>
          <h2 id="agent-posture-heading" className={styles.sectionTitle}>Data posture</h2>
        </div>
        {!canEdit && <span className="pill pill--ghost">View only</span>}
      </div>

      {/* Said once, structurally, instead of four times in prose: the gates
          above refuse requests, these do not. */}
      <p className={styles.postureBanner}>
        <strong>Recorded, not enforced.</strong>
        <span>
          Nothing in Holloway reads these today — no purge job, no export gate, no redaction pass.
          They state the intent operators and downstream automation should follow, and are the
          vocabulary the hosted product will enforce.
        </span>
      </p>

      <div className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.tile}>
            <p className={styles.tileLabel}>{tile.label}</p>
            <p className={styles.tileValue}>{tile.value}</p>
          </div>
        ))}
      </div>

      {canEdit && (
        <button type="button" className={styles.editToggle} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {editing ? 'Close' : 'Change what is declared'}
        </button>
      )}

      {editing && canEdit && (
        <>
          <div className={styles.editor}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="posture-handling">Handling level</label>
              <select id="posture-handling" className="cp-select" style={{ width: '100%' }} value={dataHandling} disabled={isPending}
                onChange={(e) => setDataHandling(e.target.value as typeof dataHandling)}>
                <option value="standard">Standard</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="posture-retention">Retention days</label>
              <input id="posture-retention" type="number" min={1} max={3650} className="cp-input" style={{ width: '100%' }}
                value={retentionDays} disabled={isPending} onChange={(e) => setRetentionDays(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="posture-redaction">Redaction level</label>
              <select id="posture-redaction" className="cp-select" style={{ width: '100%' }} value={redactionLevel} disabled={isPending}
                onChange={(e) => setRedactionLevel(e.target.value as typeof redactionLevel)}>
                <option value="standard">Standard</option>
                <option value="enhanced">Enhanced</option>
                <option value="strict">Strict</option>
              </select>
            </div>
            <div className={styles.check}>
              <input id="posture-training" type="checkbox" className="cp-check" checked={allowTraining} disabled={isPending}
                onChange={(e) => setAllowTraining(e.target.checked)} />
              <label htmlFor="posture-training">Allow training or model improvement use</label>
            </div>
            <div className={styles.check}>
              <input id="posture-exports" type="checkbox" className="cp-check" checked={allowOperatorExports} disabled={isPending}
                onChange={(e) => setAllowOperatorExports(e.target.checked)} />
              <label htmlFor="posture-exports">Allow operator exports</label>
            </div>
          </div>

          <div className={styles.actions}>
            <p className={styles.actionsNote}>
              {error ? <span className={styles.err}>{error}</span>
                : success ? <span className={styles.ok}>{success}</span>
                : 'Changing these changes what the system promises, not what it does.'}
            </p>
            <button type="button" onClick={handleSave} disabled={!dirty || isPending} className="btn btn--sm">
              {isPending ? 'Saving…' : 'Save posture'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
