import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROJECT_PRIVACY_METADATA,
  normalizeProjectPrivacyMetadata,
} from './privacy-policy.ts';



test('normalizeProjectPrivacyMetadata falls back cleanly', () => {
  assert.deepEqual(normalizeProjectPrivacyMetadata(undefined), DEFAULT_PROJECT_PRIVACY_METADATA);
});

test('normalizeProjectPrivacyMetadata keeps the one enforced field and drops the rest', () => {
  assert.deepEqual(normalizeProjectPrivacyMetadata({
    allow_observer_access: false,
    // Fields the product no longer reads. They must not survive normalization,
    // or they come back as stored state nothing enforces.
    visibility: 'confidential',
    retention_days: 14,
    allow_exports: false,
    redaction_level: 'enhanced',
  } as Record<string, unknown>), {
    version: 1,
    allow_observer_access: false,
  });
});
