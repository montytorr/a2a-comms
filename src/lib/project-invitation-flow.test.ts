import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProjectInvitationExpiry,
  getProjectInvitationReminderThreshold,
  isProjectInvitationExpired,
  isProjectInvitationReminderDue,
  PROJECT_INVITATION_REMINDER_HOURS,
  PROJECT_INVITATION_TTL_DAYS,
} from './project-invitations';

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

test('project invitation constants remain stable for sweep/CLI consumers', () => {
  assert.equal(PROJECT_INVITATION_TTL_DAYS, 7);
  assert.equal(PROJECT_INVITATION_REMINDER_HOURS, 72);
});

test('project invitation expiry defaults to 7 days after creation', () => {
  const createdAt = '2026-04-01T12:00:00.000Z';
  assert.equal(getProjectInvitationExpiry(createdAt), '2026-04-08T12:00:00.000Z');
});

test('project invitation reminder threshold defaults to 72 hours after creation', () => {
  const createdAt = '2026-04-01T12:00:00.000Z';
  assert.equal(getProjectInvitationReminderThreshold(createdAt), '2026-04-04T12:00:00.000Z');
});

test('expired invitations are gated from response', () => {
  assert.equal(
    isProjectInvitationExpired({
      status: 'pending',
      created_at: '2026-03-20T00:00:00.000Z',
      expires_at: '2026-03-27T00:00:00.000Z',
    }),
    true,
  );

  assert.equal(
    isProjectInvitationExpired({
      status: 'accepted',
      created_at: '2026-03-20T00:00:00.000Z',
      expires_at: '2026-03-27T00:00:00.000Z',
    }),
    false,
  );
});

test('reminders do not fire before the threshold', () => {
  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-03T23:59:59.000Z'),
    ),
    false,
  );
});

test('reminders send once after the threshold and never for expired invitations', () => {
  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-04T00:01:00.000Z'),
    ),
    true,
  );

  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: '2026-04-04T00:01:00.000Z',
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-05T00:01:00.000Z'),
    ),
    false,
  );

  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-03T00:00:00.000Z',
      },
      new Date('2026-04-04T00:01:00.000Z'),
    ),
    false,
  );

  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'declined',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-04T00:01:00.000Z'),
    ),
    false,
  );
});
