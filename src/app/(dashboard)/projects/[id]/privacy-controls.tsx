'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectPrivacyMetadata } from '@/lib/types';
import { normalizeProjectPrivacyMetadata } from '@/lib/privacy-policy';
import { updateProjectPrivacy } from './actions';
import styles from './project-detail.module.css';

interface ProjectPrivacyControlsProps {
  projectId: string;
  initialPrivacy: ProjectPrivacyMetadata | null | undefined;
  canEdit: boolean;
}

export default function ProjectPrivacyControls({
  projectId,
  initialPrivacy,
  canEdit,
}: ProjectPrivacyControlsProps) {
  const router = useRouter();
  const normalizedInitial = useMemo(
    () => normalizeProjectPrivacyMetadata(initialPrivacy),
    [initialPrivacy]
  );
  const [visibility, setVisibility] = useState(normalizedInitial.visibility);
  const [retentionDays, setRetentionDays] = useState(String(normalizedInitial.retention_days));
  const [allowObserverAccess, setAllowObserverAccess] = useState(normalizedInitial.allow_observer_access);
  const [allowExports, setAllowExports] = useState(normalizedInitial.allow_exports);
  const [redactionLevel, setRedactionLevel] = useState(normalizedInitial.redaction_level);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const privacyMetadata = useMemo(
    () =>
      normalizeProjectPrivacyMetadata({
        visibility,
        retention_days: Number.parseInt(retentionDays, 10),
        allow_observer_access: allowObserverAccess,
        allow_exports: allowExports,
        redaction_level: redactionLevel,
      }),
    [visibility, retentionDays, allowObserverAccess, allowExports, redactionLevel]
  );

  const dirty = JSON.stringify(privacyMetadata) !== JSON.stringify(normalizedInitial);

  function save() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await updateProjectPrivacy(projectId, privacyMetadata);
        setSuccess('Saved.');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update project privacy');
      }
    });
  }

  return (
    <section className={`card ${styles.policy}`} aria-labelledby="project-privacy-heading">
      <div className={styles.policyHead}>
        <div>
          <h2 id="project-privacy-heading" className={styles.policyTitle}>Privacy</h2>
          <p className={styles.policySub}>
            One of these refuses a request. The rest record intent.
          </p>
        </div>
        {!canEdit && <span className="pill pill--ghost">View only</span>}
      </div>

      {/* The one field with teeth, on its own, said plainly. It used to sit
          sixth in a six-up grid of identical selects, distinguishable only by
          a clause in a paragraph underneath. */}
      <div className={styles.policyEnforced}>
        <div className={styles.check}>
          <input
            id="project-observer-access"
            type="checkbox"
            className="cp-check"
            checked={allowObserverAccess}
            disabled={!canEdit || isPending}
            onChange={(e) => setAllowObserverAccess(e.target.checked)}
          />
          <label htmlFor="project-observer-access">
            <strong>Observers may open this project</strong>
            <span>
              Enforced: with this off, an observer is redirected away from the project page and the
              API answers 403 <code>PRIVACY_POLICY_BLOCKED</code>.
            </span>
          </label>
        </div>
      </div>

      <p className={styles.policyBanner}>
        <strong>Recorded, not enforced.</strong>
        <span>
          Nothing reads the three below — no purge job, no export gate, no redaction pass. They state
          the intent operators and downstream automation should follow.
        </span>
      </p>

      <div className={styles.policyGrid}>
        <div className={styles.policyField}>
          <label className={styles.policyLabel} htmlFor="project-visibility">Visibility</label>
          <select id="project-visibility" className="cp-select" style={{ width: '100%' }} value={visibility}
            disabled={!canEdit || isPending} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
            <option value="standard">Standard</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
        <div className={styles.policyField}>
          <label className={styles.policyLabel} htmlFor="project-retention">Retention days</label>
          <input id="project-retention" type="number" min={1} max={3650} className="cp-input" style={{ width: '100%' }}
            value={retentionDays} disabled={!canEdit || isPending} onChange={(e) => setRetentionDays(e.target.value)} />
        </div>
        <div className={styles.policyField}>
          <label className={styles.policyLabel} htmlFor="project-redaction">Redaction level</label>
          <select id="project-redaction" className="cp-select" style={{ width: '100%' }} value={redactionLevel}
            disabled={!canEdit || isPending} onChange={(e) => setRedactionLevel(e.target.value as typeof redactionLevel)}>
            <option value="standard">Standard</option>
            <option value="enhanced">Enhanced</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <div className={styles.check}>
          <input id="project-exports" type="checkbox" className="cp-check" checked={allowExports}
            disabled={!canEdit || isPending} onChange={(e) => setAllowExports(e.target.checked)} />
          <label htmlFor="project-exports"><strong>Exports permitted</strong></label>
        </div>
      </div>

      {canEdit && (
        <div className={styles.policyActions}>
          <p className={styles.policyNote}>
            {error ? <span className={styles.policyErr}>{error}</span>
              : success ? <span className={styles.policyOk}>{success}</span>
              : 'Owner or admin only.'}
          </p>
          <button type="button" onClick={save} disabled={!dirty || isPending} className="btn btn--primary btn--sm">
            {isPending ? 'Saving…' : 'Save privacy'}
          </button>
        </div>
      )}
    </section>
  );
}
