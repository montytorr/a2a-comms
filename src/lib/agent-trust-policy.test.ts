import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AGENT_TRUST_POLICY,
  normalizeAgentTrustPolicy,
  evaluateWebhookPolicyAccess,
  evaluateObserverProjectReadPolicyAccess,
  evaluateObserverProjectAttachmentDownloadPolicyAccess,
  evaluateProjectMemberListPolicyAccess,
  evaluateProjectObserverListPolicyAccess,
  evaluateProjectInvitationListPolicyAccess,
  canAccessPolicyTier,
  TRUST_POLICY_ACCESS_COLUMNS,
} from './agent-trust-policy.ts';
import { applyProjectInvitationVisibility } from './project-invitation-visibility.ts';
import { getAuthUser } from './auth-context.ts';

test('normalizeAgentTrustPolicy falls back to defaults for missing or malformed config', () => {
  assert.deepEqual(normalizeAgentTrustPolicy(undefined), DEFAULT_AGENT_TRUST_POLICY);
  assert.deepEqual(normalizeAgentTrustPolicy({ webhooks: { management: 'banana' } }), DEFAULT_AGENT_TRUST_POLICY);
});


test('normalizeAgentTrustPolicy keeps observer policy knobs when valid', () => {
  assert.deepEqual(normalizeAgentTrustPolicy({
    webhooks: { management: 'internal' },
    observer_project_access: { read: 'external', download_project_attachments: 'internal' },
    project_participants: { list_members: 'external', list_observers: 'internal' },
    project_invitations: { list_pending: 'partner' },
  }), {
    webhooks: { management: 'internal' },
    observer_project_access: { read: 'external', download_project_attachments: 'internal' },
    project_participants: { list_members: 'external', list_observers: 'internal' },
    project_invitations: { list_pending: 'partner' },
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


test('project participant visibility policies honor configured minimum tiers', () => {
  const memberRead = evaluateProjectMemberListPolicyAccess({
    trust_tier: 'external',
    trust_policy: { project_participants: { list_members: 'external', list_observers: 'partner' } },
  });
  assert.equal(memberRead.allowed, true);

  const observerRead = evaluateProjectObserverListPolicyAccess({
    trust_tier: 'external',
    trust_policy: { project_participants: { list_members: 'external', list_observers: 'partner' } },
  });
  assert.equal(observerRead.allowed, false);
  assert.match(observerRead.body?.error || '', /observer project observer visibility requires partner-tier trust/i);

  const invitationRead = evaluateProjectInvitationListPolicyAccess({
    trust_tier: 'partner',
    trust_policy: { project_invitations: { list_pending: 'internal' } },
  });
  assert.equal(invitationRead.allowed, false);
  assert.match(invitationRead.body?.error || '', /observer project invitation visibility requires internal-tier trust/i);
});


test('observer invitation visibility strips pending rows but can still expose a coarse summary', () => {
  const result = applyProjectInvitationVisibility([
    { status: 'pending' },
    { status: 'accepted' },
    { status: 'declined' },
  ], {
    trust_tier: 'partner',
    trust_policy: {
      project_invitations: { list_pending: 'internal' },
      project_participants: { list_members: 'partner', list_observers: 'partner' },
    },
  }, {
    treatAsObserver: true,
    includeObserverSummary: true,
  });

  assert.equal(result.canListPending, false);
  assert.equal(result.canSeeSummary, true);
  assert.equal(result.hiddenPendingCount, 1);
  assert.deepEqual(result.visibleInvitations.map((inv) => inv.status), ['accepted', 'declined']);
});

test('tier rank helper is monotonic', () => {
  assert.equal(canAccessPolicyTier('internal', 'partner'), true);
  assert.equal(canAccessPolicyTier('partner', 'partner'), true);
  assert.equal(canAccessPolicyTier('external', 'partner'), false);
});

test('getAuthUser source aggregates owned agent trust with least privilege semantics', () => {
  const source = getAuthUser.toString();

  assert.match(source, /selectLeastPrivilegeTier/);
  assert.match(source, /buildLeastPrivilegeTrustPolicy/);
  assert.match(source, /normalizedAgents\.map\(agent=>agent\.trustTier\)|normalizedAgents\.map\(\(agent\) => agent\.trustTier\)/);
  assert.match(source, /normalizedAgents\.map\(agent=>agent\.trustPolicy\)|normalizedAgents\.map\(\(agent\) => agent\.trustPolicy\)/);
  assert.match(source, /agents:\s*normalizedAgents/);
});

// Regression, the fail-OPEN direction: an unselected `trust_policy` column is
// `undefined`, and normalizeAgentTrustPolicy(undefined) returns the permissive
// default — so forgetting the column silently discards an owner's stricter
// setting instead of denying. That is worse than the fail-closed variant,
// because nothing ever complains.
test('a policy decision refuses to run on an agent row loaded without trust_policy', () => {
  const partial = { id: 'x', name: 'partial-bot', trust_tier: 'internal' };
  assert.throws(
    () => evaluateWebhookPolicyAccess(partial),
    /was loaded without trust_policy/
  );
});

test('a null trust_policy is a real data state and uses the defaults', () => {
  const noPolicy = { id: 'y', name: 'default-bot', trust_tier: 'internal', trust_policy: null };
  const decision = evaluateWebhookPolicyAccess(noPolicy);
  assert.equal(decision.allowed, true);
});

test('TRUST_POLICY_ACCESS_COLUMNS includes trust_policy', () => {
  assert.ok(TRUST_POLICY_ACCESS_COLUMNS.split(',').map((c) => c.trim()).includes('trust_policy'));
});
