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

function comparable(value: ReturnType<typeof normalizeProjectPrivacyMetadata>) {
  return JSON.stringify(value);
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
  const [visibility, setVisibility] = useState<'standard' | 'confidential' | 'restricted'>(
    normalizedInitial.visibility
  );
  const [retentionMode, setRetentionMode] = useState<'standard' | 'short' | 'strict'>(
    normalizedInitial.retention_mode
  );
  const [retentionDays, setRetentionDays] = useState(String(normalizedInitial.retention_days));
  const [allowObserverAccess, setAllowObserverAccess] = useState(
    normalizedInitial.allow_observer_access
  );
  const [allowExports, setAllowExports] = useState(normalizedInitial.allow_exports);
  const [redactionLevel, setRedactionLevel] = useState<'standard' | 'enhanced' | 'strict'>(
    normalizedInitial.redaction_level
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const privacyMetadata = useMemo(
    () =>
      normalizeProjectPrivacyMetadata({
        visibility,
        retention_mode: retentionMode,
        retention_days: Number.parseInt(retentionDays, 10),
        allow_observer_access: allowObserverAccess,
        allow_exports: allowExports,
        redaction_level: redactionLevel,
      }),
    [visibility, retentionMode, retentionDays, allowObserverAccess, allowExports, redactionLevel]
  );

  const dirty = comparable(privacyMetadata) !== comparable(normalizedInitial);

  function save() {
    if (!dirty || !canEdit) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await updateProjectPrivacy(projectId, privacyMetadata);
        setSuccess('Project privacy controls updated.');
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to update project privacy controls'
        );
      }
    });
  }

  return (
    <details className="card">
      <summary className={styles.policySummary}>
        <strong>Privacy policy</strong>
        <span>{privacyMetadata.visibility} visibility · {privacyMetadata.retention_days}d retention · {privacyMetadata.redaction_level} redaction</span>
      </summary>
      <div className={styles.policyBody}>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        }}
      >
        <div>
          <label className="upper text-2xs" style={{ display: 'block', marginBottom: 8 }}>
            Visibility
          </label>
          <select
            value={visibility}
            disabled={!canEdit || isPending}
            onChange={(e) =>
              setVisibility(e.target.value as 'standard' | 'confidential' | 'restricted')
            }
            className="cp-select"
            style={{ width: '100%' }}
          >
            <option value="standard">Standard</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
        <div>
          <label className="upper text-2xs" style={{ display: 'block', marginBottom: 8 }}>
            Retention mode
          </label>
          <select
            value={retentionMode}
            disabled={!canEdit || isPending}
            onChange={(e) =>
              setRetentionMode(e.target.value as 'standard' | 'short' | 'strict')
            }
            className="cp-select"
            style={{ width: '100%' }}
          >
            <option value="standard">Standard</option>
            <option value="short">Short</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <div>
          <label className="upper text-2xs" style={{ display: 'block', marginBottom: 8 }}>
            Retention days
          </label>
          <input
            value={retentionDays}
            disabled={!canEdit || isPending}
            onChange={(e) => setRetentionDays(e.target.value)}
            inputMode="numeric"
            className="cp-input"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="upper text-2xs" style={{ display: 'block', marginBottom: 8 }}>
            Redaction level
          </label>
          <select
            value={redactionLevel}
            disabled={!canEdit || isPending}
            onChange={(e) =>
              setRedactionLevel(e.target.value as 'standard' | 'enhanced' | 'strict')
            }
            className="cp-select"
            style={{ width: '100%' }}
          >
            <option value="standard">Standard</option>
            <option value="enhanced">Enhanced</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <label
          className="text-xs" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            
            color: 'var(--fg-2)',
          }}
        >
          <input
            className="cp-check"
            type="checkbox"
            checked={allowObserverAccess}
            disabled={!canEdit || isPending}
            onChange={(e) => setAllowObserverAccess(e.target.checked)}
          />
          Allow observer access
        </label>
        <label
          className="text-xs" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            
            color: 'var(--fg-2)',
          }}
        >
          <input
            className="cp-check"
            type="checkbox"
            checked={allowExports}
            disabled={!canEdit || isPending}
            onChange={(e) => setAllowExports(e.target.checked)}
          />
          Allow exports
        </label>
      </div>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <p className="dim text-2xs" style={{ maxWidth: '60ch' }}>
          Allow observer access is enforced immediately on project visibility. The retention,
          export, visibility, and redaction fields are currently policy metadata for operators and
          downstream automation, not automatic retention jobs.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && (
            <span className="text-2xs" style={{ color: 'var(--rose)' }}>{error}</span>
          )}
          {success && !error && (
            <span className="text-2xs" style={{ color: 'var(--mint)' }}>{success}</span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={!dirty || isPending}
              className="btn btn--primary btn--sm"
            >
              {isPending ? 'Saving…' : 'Save privacy policy'}
            </button>
          )}
        </div>
      </div>
      </div>
    </details>
  );
}
