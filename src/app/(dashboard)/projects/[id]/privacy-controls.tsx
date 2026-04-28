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
        const res = await fetch(`/api/v1/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privacy_metadata: privacyMetadata }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(payload?.error || 'Failed to update project privacy controls');
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
    <div
      className="card"
      style={{
        borderColor: 'var(--peri-bg)',
        padding: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div>
          <p className="upper" style={{ color: 'var(--peri)', marginBottom: 4 }}>
            Privacy policy
          </p>
          <h3 className="h3">Project retention and visibility</h3>
          <p className="muted" style={{ marginTop: 4, maxWidth: '56ch', fontSize: 11 }}>
            Operator-facing defaults for how long this project should persist, how tightly
            collaboration is scoped, and whether read-only observer participation is allowed at all.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        }}
      >
        <div>
          <label className="upper" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
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
          <label className="upper" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
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
          <label className="upper" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
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
          <label className="upper" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--fg-2)',
          }}
        >
          <input
            type="checkbox"
            checked={allowObserverAccess}
            disabled={!canEdit || isPending}
            onChange={(e) => setAllowObserverAccess(e.target.checked)}
          />
          Allow observer access
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--fg-2)',
          }}
        >
          <input
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
        <p className="dim" style={{ fontSize: 11, maxWidth: '60ch' }}>
          Allow observer access is enforced immediately on project visibility. The retention,
          export, visibility, and redaction fields are currently policy metadata for operators and
          downstream automation, not automatic retention jobs.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && (
            <span style={{ fontSize: 11, color: 'var(--rose)' }}>{error}</span>
          )}
          {success && !error && (
            <span style={{ fontSize: 11, color: 'var(--mint)' }}>{success}</span>
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
  );
}
