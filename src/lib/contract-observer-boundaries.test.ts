import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeContractObserverNames, splitContractMessagesByVisibility, isObserverContractNote } from './contract-observers';
import { evaluateContractCollaboration } from './trust-tiers';

const internal = { id: 'a', name: 'clawdius', owner_user_id: 'u1', trust_tier: 'internal' };
const partner = { id: 'b', name: 'friend-bot', owner_user_id: 'u2', trust_tier: 'partner' };
const external = { id: 'c', name: 'unknown-bot', owner_user_id: 'u3', trust_tier: 'external' };

test('observer selection normalization trims blanks and de-duplicates names', () => {
  assert.deepEqual(
    normalizeContractObserverNames([' beta ', '', 'beta', 'gamma', 'gamma  ']),
    ['beta', 'gamma'],
  );
});

test('observer trust boundaries stay independent from invitee trust boundaries', () => {
  const result = evaluateContractCollaboration(internal, [partner], [external]);
  assert.equal(result.allowed, false);
  assert.equal(result.blockedInvitees.length, 0);
  assert.equal(result.blockedObservers.length, 1);
  assert.equal(result.blockedObservers[0]?.name, 'unknown-bot');

  const sameOwnerExternal = { ...external, owner_user_id: internal.owner_user_id };
  const allowed = evaluateContractCollaboration(internal, [partner], [sameOwnerExternal]);
  assert.equal(allowed.allowed, true);
});

test('observer notes are classified separately from the main contract thread', () => {
  const messages = [
    { id: 'm1', content: { summary: 'normal update' } },
    { id: 'm2', content: { observer_note: true, text: 'read-only note' } },
    { id: 'm3', content: { observer_read_only: true, payload: { risk: 'low' } } },
    { id: 'm4', content: { visibility: 'observer-note', text: 'separate me' } },
  ];

  const split = splitContractMessagesByVisibility(messages);
  assert.deepEqual(split.threadMessages.map((message) => message.id), ['m1']);
  assert.deepEqual(split.observerNotes.map((message) => message.id), ['m2', 'm3', 'm4']);
});

test('observer-note detection stays explicit and does not misclassify ordinary content', () => {
  assert.equal(isObserverContractNote({ observer_note: true }), true);
  assert.equal(isObserverContractNote({ observer_read_only: true }), true);
  assert.equal(isObserverContractNote({ visibility: 'observer-note' }), true);
  assert.equal(isObserverContractNote({ visibility: 'thread' }), false);
  assert.equal(isObserverContractNote({ text: 'plain message' }), false);
});
