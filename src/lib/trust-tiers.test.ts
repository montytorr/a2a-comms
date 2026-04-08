import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAgentTrustTier,
  evaluateProjectMemberInvite,
  evaluateObserverAccess,
  evaluateHandoffInvite,
  evaluateEscalationBroker,
} from './trust-tiers';

const internal = { id: 'a', name: 'clawdius', owner_user_id: 'u1', trust_tier: 'internal' };
const partner = { id: 'b', name: 'friend-bot', owner_user_id: 'u2', trust_tier: 'partner' };
const external = { id: 'c', name: 'unknown-bot', owner_user_id: 'u3', trust_tier: 'external' };

test('normalizeAgentTrustTier defaults unknown values to external', () => {
  assert.equal(normalizeAgentTrustTier('partner'), 'partner');
  assert.equal(normalizeAgentTrustTier('weird'), 'external');
  assert.equal(normalizeAgentTrustTier(undefined), 'external');
});

test('project membership blocks external-tier agents', () => {
  assert.equal(evaluateProjectMemberInvite(internal, partner).allowed, true);
  const denied = evaluateProjectMemberInvite(internal, external);
  assert.equal(denied.allowed, false);
  assert.match(denied.reason || '', /cannot be invited as project members/i);
});

test('observer access allows partner agents but blocks cross-owner externals', () => {
  assert.equal(evaluateObserverAccess(internal, partner).allowed, true);
  const denied = evaluateObserverAccess(internal, external);
  assert.equal(denied.allowed, false);
  assert.match(denied.reason || '', /need at least partner trust/i);
});

test('handoff contracts are restricted to internal-tier agents', () => {
  assert.equal(evaluateHandoffInvite(internal, internal).allowed, true);
  assert.equal(evaluateHandoffInvite(internal, partner).allowed, false);
  assert.equal(evaluateHandoffInvite(internal, external).allowed, false);
});

test('escalation brokers allow partners but reject external-tier agents', () => {
  assert.equal(evaluateEscalationBroker(internal, partner).allowed, true);
  assert.equal(evaluateEscalationBroker(internal, external).allowed, false);
});
