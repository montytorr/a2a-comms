import test from 'node:test';
import assert from 'node:assert/strict';

function filterAvailableAgents(
  allAgents: Array<{ id: string }>,
  memberIds: string[],
  pendingInviteIds: string[]
) {
  const memberSet = new Set(memberIds);
  const pendingSet = new Set(pendingInviteIds);
  return allAgents.filter((agent) => !memberSet.has(agent.id) && !pendingSet.has(agent.id));
}

function resolveInvitationAction(action: 'accept' | 'decline' | 'cancel') {
  return action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled';
}

test('available agents exclude existing members and pending invitees', () => {
  const agents = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const available = filterAvailableAgents(agents, ['a'], ['c']);
  assert.deepEqual(available.map((a) => a.id), ['b', 'd']);
});

test('invitation actions map to stable statuses', () => {
  assert.equal(resolveInvitationAction('accept'), 'accepted');
  assert.equal(resolveInvitationAction('decline'), 'declined');
  assert.equal(resolveInvitationAction('cancel'), 'cancelled');
});
