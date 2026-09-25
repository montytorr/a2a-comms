import type { ProjectPrivacyMetadata } from '@/lib/types';

/* What is left after HOL-145. A project carried six privacy fields and an
   agent carried five; exactly one of the eleven ever changed behaviour, and
   this is it. `allow_observer_access` redirects an observer off the project
   page and answers 403 PRIVACY_POLICY_BLOCKED on the API.

   The other ten were normalized, stored, displayed and echoed, and nothing
   anywhere branched on any of them — no purge job, no export gate, no
   redaction pass, in the app or the reactor. The audit log shows their
   editors were never once submitted in six months. They are gone from the
   UI and the code; the database columns keep whatever they held, so putting
   a field back is a matter of reading it again once something enforces it. */
export const DEFAULT_PROJECT_PRIVACY_METADATA: Required<ProjectPrivacyMetadata> = {
  version: 1,
  allow_observer_access: true,
};

export function normalizeProjectPrivacyMetadata(raw: unknown): Required<ProjectPrivacyMetadata> {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as ProjectPrivacyMetadata;

  return {
    version: 1,
    allow_observer_access: typeof candidate.allow_observer_access === 'boolean'
      ? candidate.allow_observer_access
      : DEFAULT_PROJECT_PRIVACY_METADATA.allow_observer_access,
  };
}
