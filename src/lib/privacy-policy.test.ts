import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AGENT_PRIVACY_METADATA,
  DEFAULT_PROJECT_PRIVACY_METADATA,
  normalizeAgentPrivacyMetadata,
  normalizeProjectPrivacyMetadata,
} from './privacy-policy.ts';

test('normalizeAgentPrivacyMetadata falls back cleanly', () => {
  assert.deepEqual(normalizeAgentPrivacyMetadata(undefined), DEFAULT_AGENT_PRIVACY_METADATA);
  assert.deepEqual(normalizeAgentPrivacyMetadata({ retention_days: 0, redaction_level: 'banana' }), {
    ...DEFAULT_AGENT_PRIVACY_METADATA,
    retention_days: 1,
  });
});

test('normalizeAgentPrivacyMetadata keeps valid values', () => {
  assert.deepEqual(normalizeAgentPrivacyMetadata({
    data_handling: 'restricted',
    retention_days: 30,
    allow_training: true,
    allow_operator_exports: false,
    redaction_level: 'strict',
  }), {
    version: 1,
    data_handling: 'restricted',
    retention_days: 30,
    allow_training: true,
    allow_operator_exports: false,
    redaction_level: 'strict',
  });
});

test('normalizeProjectPrivacyMetadata falls back cleanly', () => {
  assert.deepEqual(normalizeProjectPrivacyMetadata(undefined), DEFAULT_PROJECT_PRIVACY_METADATA);
});

test('normalizeProjectPrivacyMetadata clamps and preserves valid values', () => {
  assert.deepEqual(normalizeProjectPrivacyMetadata({
    visibility: 'confidential',
    retention_mode: 'short',
    retention_days: 14.2,
    allow_observer_access: false,
    allow_exports: false,
    redaction_level: 'enhanced',
  }), {
    version: 1,
    visibility: 'confidential',
    retention_mode: 'short',
    retention_days: 14,
    allow_observer_access: false,
    allow_exports: false,
    redaction_level: 'enhanced',
  });
});
