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

/* Down from six controls to one. The other five — visibility, retention mode,
   retention days, redaction level and export permission — were normalized,
   stored and displayed while nothing in the system read any of them. This one
   refuses a request. */
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
  const [allowObserverAccess, setAllowObserverAccess] = useState(normalizedInitial.allow_observer_access);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = allowObserverAccess !== normalizedInitial.allow_observer_access;

  function save(next: boolean) {
    if (!canEdit) return;
    setAllowObserverAccess(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateProjectPrivacy(projectId, normalizeProjectPrivacyMetadata({ allow_observer_access: next }));
        router.refresh();
      } catch (err) {
        setAllowObserverAccess(!next);
        setError(err instanceof Error ? err.message : 'Failed to update');
      }
    });
  }

  return (
    <section className={`card ${styles.policy}`} aria-labelledby="project-privacy-heading">
      <h2 id="project-privacy-heading" className={styles.aboutTitle}>Access</h2>
      <div className={styles.check}>
        <input
          id="project-observer-access"
          type="checkbox"
          className="cp-check"
          checked={allowObserverAccess}
          disabled={!canEdit || isPending}
          onChange={(e) => save(e.target.checked)}
        />
        <label htmlFor="project-observer-access">
          <strong>Observers may open this project</strong>
          <span>
            With this off, an observer is redirected away from the project page and the API answers
            403 <code>PRIVACY_POLICY_BLOCKED</code>.
          </span>
        </label>
      </div>
      {error && <p className={styles.policyErr}>{error}</p>}
      {!canEdit && <p className={styles.policyNote}>Owner or admin only.</p>}
      {dirty && isPending && <p className={styles.policyNote}>Saving…</p>}
    </section>
  );
}
