import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWebhookManagementAccess } from './webhook-trust-policy';

test('partner and internal agents can manage webhooks', () => {
  assert.deepEqual(evaluateWebhookManagementAccess('register', { trust_tier: 'internal' }), {
    allowed: true,
    callerTier: 'internal',
  });

  assert.deepEqual(evaluateWebhookManagementAccess('test', { trust_tier: 'partner' }), {
    allowed: true,
    callerTier: 'partner',
  });
});

test('per-agent webhook policy can raise the minimum required tier', () => {
  const decision = evaluateWebhookManagementAccess('register', {
    trust_tier: 'partner',
    trust_policy: { webhooks: { management: 'internal' } },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.callerTier, 'partner');
  assert.match(decision.body.error, /requires internal-tier trust/i);
});

test('external-tier agents are blocked from all webhook management actions', () => {
  for (const action of ['register', 'update', 'delete', 'test', 'list'] as const) {
    const decision = evaluateWebhookManagementAccess(action, { trust_tier: 'external' });
    assert.equal(decision.allowed, false);
    assert.equal(decision.callerTier, 'external');
    assert.equal(decision.status, 403);
    assert.match(decision.body.error, /External-tier agents cannot/i);
  }
});

test('unknown trust tiers default to external for webhook management', () => {
  const decision = evaluateWebhookManagementAccess('register', { trust_tier: 'mystery' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.callerTier, 'external');
  assert.match(decision.body.error, /promoted to partner/i);
});
