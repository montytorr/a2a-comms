import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AGENT_TRUST_POLICY,
  normalizeAgentTrustPolicy,
  evaluateWebhookPolicyAccess,
  evaluateObserverProjectReadPolicyAccess,
  evaluateObserverProjectAttachmentDownloadPolicyAccess,
  canAccessPolicyTier,
} from './agent-trust-policy';

test('normalizeAgentTrustPolicy falls back to defaults for missing or malformed config', () => {
  assert.deepEqual(normalizeAgentTrustPolicy(undefined), DEFAULT_AGENT_TRUST_POLICY);
  assert.deepEqual(normalizeAgentTrustPolicy({ webhooks: { management: 'banana' } }), DEFAULT_AGENT_TRUST_POLICY);
});


test('normalizeAgentTrustPolicy keeps observer policy knobs when valid', () => {
  assert.deepEqual(normalizeAgentTrustPolicy({
    webhooks: { management: 'internal' },
    observer_project_access: { read: 'external', download_project_attachments: 'internal' },
  }), {
    webhooks: { management: 'internal' },
    observer_project_access: { read: 'external', download_project_attachments: 'internal' },
  });
});

test('webhook policy access honors configured minimum tier', () => {
  const allowed = evaluateWebhookPolicyAccess({
    trust_tier: 'partner',
    trust_policy: { webhooks: { management: 'partner' } },
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.callerTier, 'partner');
  assert.equal(allowed.requiredTier, 'partner');

  const denied = evaluateWebhookPolicyAccess({
    trust_tier: 'partner',
    trust_policy: { webhooks: { management: 'internal' } },
  });

  assert.equal(denied.allowed, false);
  assert.equal(denied.callerTier, 'partner');
  assert.equal(denied.requiredTier, 'internal');
  assert.match(denied.body?.error || '', /requires internal-tier trust/i);
});

test('observer project read policy honors configured minimum tier', () => {
  const allowed = evaluateObserverProjectReadPolicyAccess({
    trust_tier: 'partner',
    trust_policy: { observer_project_access: { read: 'partner' } },
  });
  assert.equal(allowed.allowed, true);

  const denied = evaluateObserverProjectReadPolicyAccess({
    trust_tier: 'external',
    trust_policy: { observer_project_access: { read: 'partner' } },
  });
  assert.equal(denied.allowed, false);
  assert.match(denied.body?.error || '', /observer project read access requires partner-tier trust/i);
});


test('observer attachment download policy can stay stricter than plain observer reads', () => {
  const denied = evaluateObserverProjectAttachmentDownloadPolicyAccess({
    trust_tier: 'partner',
    trust_policy: { observer_project_access: { read: 'external', download_project_attachments: 'internal' } },
  });

  assert.equal(denied.allowed, false);
  assert.equal(denied.requiredTier, 'internal');
  assert.match(denied.body?.error || '', /attachment downloads require internal-tier trust/i);
});


test('tier rank helper is monotonic', () => {
  assert.equal(canAccessPolicyTier('internal', 'partner'), true);
  assert.equal(canAccessPolicyTier('partner', 'partner'), true);
  assert.equal(canAccessPolicyTier('external', 'partner'), false);
});
