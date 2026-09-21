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
  TRUST_POLICY_AGENT_COLUMNS,
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

// Regression: a partial agent row must be loud, not quietly restrictive.
// `POST /v1/projects/:id/invitations` selected 'id, name, display_name', so
// every target's trust_tier was undefined, normalised to 'external', and every
// invite — including partner agents — came back 403 "External-tier agents
// cannot be invited as project members". The gate was right; the row was wrong.
test('a gate refuses to run on an agent row loaded without trust_tier', () => {
  const partialTarget = { id: 'd', name: 'partial-bot', owner_user_id: 'u4' };
  assert.throws(
    () => evaluateProjectMemberInvite(internal, partialTarget),
    /was loaded without trust_tier/
  );
});

test('a gate refuses to run on an agent row loaded without owner_user_id', () => {
  // evaluateObserverAccess compares owners, and an absent column would read as
  // "different owners" — the restrictive answer, silently.
  const noOwner = { id: 'e', name: 'ownerless-bot', trust_tier: 'external' };
  assert.throws(
    () => evaluateObserverAccess(internal, noOwner),
    /was loaded without owner_user_id/
  );
});

test('TRUST_POLICY_AGENT_COLUMNS names every column the gates read', () => {
  for (const column of ['id', 'name', 'owner_user_id', 'trust_tier']) {
    assert.ok(
      TRUST_POLICY_AGENT_COLUMNS.split(',').map((c) => c.trim()).includes(column),
      `${column} missing from TRUST_POLICY_AGENT_COLUMNS`
    );
  }
});

test('a null trust_tier is a real data state and still normalises to external', () => {
  // Distinct from the absent-column case above: this row WAS selected.
  const untiered = { id: 'f', name: 'new-bot', owner_user_id: 'u5', trust_tier: null };
  const decision = evaluateProjectMemberInvite(internal, untiered);
  assert.equal(decision.allowed, false);
  assert.equal(decision.targetTier, 'external');
});
