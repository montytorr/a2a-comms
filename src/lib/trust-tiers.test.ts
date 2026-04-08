import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAgentTrustTier,
  evaluateProjectMemberInvite,
  evaluateObserverAccess,
  evaluateHandoffInvite,
  evaluateEscalationBroker,
  evaluateGenericContractInvite,
  evaluateContractInvitees,
  evaluateContractObservers,
  evaluateContractCollaboration,
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

test('generic contract proposals block cross-owner external invitees but allow same-owner exception', () => {
  assert.equal(evaluateGenericContractInvite(internal, partner).allowed, true);
  const denied = evaluateGenericContractInvite(internal, external);
  assert.equal(denied.allowed, false);
  assert.match(denied.reason || '', /generic contract proposals/i);

  const sameOwnerExternal = { ...external, owner_user_id: internal.owner_user_id };
  assert.equal(evaluateGenericContractInvite(internal, sameOwnerExternal).allowed, true);
});

test('multi-invite contract gating reports blocked targets coherently', () => {
  const result = evaluateContractInvitees(internal, [partner, external]);
  assert.equal(result.allowed, false);
  assert.equal(result.blockedTargets.length, 1);
  assert.equal(result.blockedTargets[0]?.name, external.name);
  assert.match(result.reason || '', /unknown-bot/i);
});

test('contract observers reuse observer trust policy', () => {
  const allowed = evaluateContractObservers(internal, [partner]);
  assert.equal(allowed.allowed, true);

  const denied = evaluateContractObservers(internal, [external]);
  assert.equal(denied.allowed, false);
  assert.equal(denied.blockedTargets[0]?.name, external.name);
  assert.match(denied.reason || '', /observe another owner's project/i);
});

test('contract collaboration gating validates invitees and observers separately', () => {
  const blockedObserver = evaluateContractCollaboration(internal, [partner], [external]);
  assert.equal(blockedObserver.allowed, false);
  assert.equal(blockedObserver.blockedInvitees.length, 0);
  assert.equal(blockedObserver.blockedObservers.length, 1);
  assert.equal(blockedObserver.blockedObservers[0]?.name, external.name);

  const allowed = evaluateContractCollaboration(internal, [partner], [{ ...external, owner_user_id: internal.owner_user_id }]);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.blockedInvitees.length, 0);
  assert.equal(allowed.blockedObservers.length, 0);
});
